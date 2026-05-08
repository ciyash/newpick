/**
 * lib/prize-distribution-v2.js
 *
 * Pure math library — no DB, no side effects.
 * Implements the 40-25-15-10-10 exponential concentration model.
 *
 * Exports:
 *   buildPrizeDistribution({ maxEntries, entryFee, platformFeePercent, winnerPercent })
 *   getPrizeForRankV2(rank, prizeDistribution, entryFee, totalWinners)
 *   validateDistribution(distribution)
 *
 * Allocation model:
 *   40% of prize pool → Top 10    (exponential cascade, rank 1 gets ~28% of that)
 *   25% of prize pool → Ranks 11–100   (% of rank-10 prize, 5 sub-ranges)
 *   15% of prize pool → Ranks 101–1,000 (% of rank-100 prize, 3 sub-ranges)
 *   10% of prize pool → Ranks 1,001–prizeEnd (lower zone, 2 sub-ranges)
 *   10% reserved as refund zone → ranks prizeEnd+1 to W_total (1× entry fee back)
 *
 * Prize winners  = always 20% of spots (real prize ladder)
 * Refund winners = winnerPercent% − 20% of spots (entry fee back)
 * Shown to user  = winnerPercent% total ("55% Winners" headline)
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUND = (n, d = 2) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);

const CHAMPION_RATIOS_RAW = [0.28, 0.12, 0.08, 0.06, 0.05, 0.04, 0.035, 0.03, 0.025, 0.02];
const CHAMPION_RATIO_SUM  = CHAMPION_RATIOS_RAW.reduce((s, r) => s + r, 0);
const CHAMPION_RATIOS     = CHAMPION_RATIOS_RAW.map(r => r / CHAMPION_RATIO_SUM);

const ALLOC_ELITE   = 0.40;
const ALLOC_TOP100  = 0.25;
const ALLOC_MID     = 0.15;
const ALLOC_LOWER   = 0.10;
const PRIZE_PCT     = 0.20;   // real prize ladder always covers 20% of spots
export const SAFE_PRIZE_SLAB_LIMIT = 1000;

const TOP100_SUBRANGES = [
  { from: 11,  to: 20,  pct: 0.70 },
  { from: 21,  to: 40,  pct: 0.45 },
  { from: 41,  to: 60,  pct: 0.28 },
  { from: 61,  to: 80,  pct: 0.18 },
  { from: 81,  to: 100, pct: 0.10 },
];

const MID_SUBRANGES = [
  { from: 101, to: 300,  pct: 0.50 },
  { from: 301, to: 600,  pct: 0.32 },
  { from: 601, to: 1000, pct: 0.18 },
];

const slabStart = (s) => s.from ?? s.rank ?? s.rank_from;
const slabEnd = (s) => s.to ?? s.rank ?? s.rank_to;
const slabPrize = (s) => s.prize ?? s.amount;

/**
 * Normalize prize slabs to compact ranges.
 *
 * The DB stores ranges instead of per-rank rows so a contest with millions of
 * entries still serializes a tiny JSON payload. Adjacent slabs with the same
 * prize are merged without changing payout semantics.
 */
export const compressPrizeSlabs = (slabs = []) => {
  const normalized = [];
  let isSorted = true;
  let previousFrom = 0;

  for (const raw of slabs) {
    const from = Number(slabStart(raw));
    const to = Number(slabEnd(raw));
    const prize = ROUND(Number(slabPrize(raw)));
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from <= 0 ||
      to < from ||
      !Number.isFinite(prize)
    ) {
      continue;
    }

    if (from < previousFrom) isSorted = false;
    previousFrom = from;
    normalized.push({ from, to, prize });
  }

  if (!isSorted) normalized.sort((a, b) => a.from - b.from);

  const compressed = [];
  for (const slab of normalized) {
    const prev = compressed[compressed.length - 1];
    if (prev && prev.to + 1 === slab.from && prev.prize === slab.prize) {
      prev.to = slab.to;
    } else {
      compressed.push({ ...slab });
    }
  }

  return compressed;
};

// ─── buildPrizeDistribution ────────────────────────────────────────────────────

/**
 * Build complete prize distribution for any contest.
 *
 * @param {object} opts
 * @param {number} opts.maxEntries          - Total spots (5,000–5,000,000)
 * @param {number} opts.entryFee            - Entry fee in £ (e.g. 3)
 * @param {number} opts.platformFeePercent  - Platform fee % (e.g. 6)
 * @param {number} opts.winnerPercent       - % shown to users as winners (20–60)
 *
 * @returns {{
 *   prize_distribution: Array,
 *   summary: object,
 *   zones: Array
 * }}
 */
export function buildPrizeDistribution({
  maxEntries,
  entryFee,
  platformFeePercent,
  winnerPercent,
}) {
  // ── Validate inputs ────────────────────────────────────────────────────────
  if (!Number.isInteger(maxEntries) || maxEntries < 5000 || maxEntries > 5000000)
    throw new Error("maxEntries must be an integer between 5,000 and 5,000,000");
  if (typeof entryFee !== "number" || entryFee <= 0)
    throw new Error("entryFee must be a positive number");
  if (typeof platformFeePercent !== "number" || platformFeePercent < 0 || platformFeePercent >= 100)
    throw new Error("platformFeePercent must be between 0 and 100");
  if (typeof winnerPercent !== "number" || winnerPercent < 20 || winnerPercent > 60)
    throw new Error("winnerPercent must be between 20 and 60");

  // ── Pool math ──────────────────────────────────────────────────────────────
  const collected    = ROUND(maxEntries * entryFee);
  const platformFee  = ROUND(collected * platformFeePercent / 100);
  const bonusPool    = ROUND(collected - platformFee);

  const W_total      = Math.floor(maxEntries * winnerPercent / 100);
  const W_prize      = Math.floor(maxEntries * PRIZE_PCT);
  const W_refund     = W_total - W_prize;

  if (W_prize < 10)
    throw new Error("Not enough spots for prize distribution (need at least 50 spots)");
  if (W_refund < 0)
    throw new Error("winnerPercent must be >= 20 so prize winners = 20% of spots");

  const refundCost   = ROUND(W_refund * entryFee);
  const prizePool    = ROUND(bonusPool - refundCost);

  if (prizePool <= 0)
    throw new Error("Prize pool is non-positive — reduce winnerPercent or platformFeePercent");

  // ── Zone budgets ───────────────────────────────────────────────────────────
  const budgetElite  = ROUND(prizePool * ALLOC_ELITE);
  const budgetTop100 = ROUND(prizePool * ALLOC_TOP100);
  const budgetMid    = ROUND(prizePool * ALLOC_MID);
  const budgetLower  = ROUND(prizePool - budgetElite - budgetTop100 - budgetMid);

  // ── Top 10 — exponential cascade ──────────────────────────────────────────
  const top10 = CHAMPION_RATIOS.map((ratio, i) => ({
    from:  i + 1,
    to:    i + 1,
    count: 1,
    prize: ROUND(budgetElite * ratio),
    zone:  "elite",
  }));
  const r10prize = top10[9].prize;

  // ── Ranks 11–100 — % of rank-10, scaled to budget ─────────────────────────
  const top100Ranges = TOP100_SUBRANGES.map(s => ({
    from:  s.from,
    to:    s.to,
    count: s.to - s.from + 1,
    prize: ROUND(r10prize * s.pct),
    zone:  "top100",
  }));
  const rawTop100Cost = top100Ranges.reduce((s, r) => s + r.prize * r.count, 0);
  if (rawTop100Cost > 0) {
    const scale = budgetTop100 / rawTop100Cost;
    top100Ranges.forEach(r => {
      r.prize = Math.max(ROUND(r.prize * scale), ROUND(entryFee * 1.5));
    });
  }
  const r100prize = top100Ranges[top100Ranges.length - 1].prize;

  // ── Ranks 101–1,000 — % of rank-100, scaled to budget ─────────────────────
  const effectiveMidEnd = Math.min(1000, W_prize);
  const midRanges = MID_SUBRANGES
    .filter(s => s.from <= effectiveMidEnd)
    .map(s => {
      const to = Math.min(s.to, effectiveMidEnd);
      return {
        from:  s.from,
        to,
        count: to - s.from + 1,
        prize: ROUND(r100prize * s.pct),
        zone:  "mid",
      };
    });
  const rawMidCost = midRanges.reduce((s, r) => s + r.prize * r.count, 0);
  if (rawMidCost > 0) {
    const scale = budgetMid / rawMidCost;
    midRanges.forEach(r => {
      r.prize = Math.max(ROUND(r.prize * scale), ROUND(entryFee * 1.1));
    });
  }

  // ── Ranks 1,001–W_prize — lower zone, 2 sub-ranges ────────────────────────
  const lowerRanges = [];
  const lowerStart  = Math.min(1001, W_prize);
  if (W_prize >= lowerStart) {
    const r1000prize = midRanges.length
      ? midRanges[midRanges.length - 1].prize
      : ROUND(entryFee * 1.1);
    const lowerMid   = Math.floor((lowerStart + W_prize) / 2);

    if (lowerMid >= lowerStart) {
      lowerRanges.push({
        from:  lowerStart,
        to:    lowerMid,
        count: lowerMid - lowerStart + 1,
        prize: Math.max(ROUND(r1000prize * 0.5), ROUND(entryFee * 1.05)),
        zone:  "lower",
      });
    }
    if (W_prize > lowerMid) {
      lowerRanges.push({
        from:  lowerMid + 1,
        to:    W_prize,
        count: W_prize - lowerMid,
        prize: Math.max(ROUND(r1000prize * 0.3), ROUND(entryFee + 0.01)),
        zone:  "lower",
      });
    }
    const rawLowerCost = lowerRanges.reduce((s, r) => s + r.prize * r.count, 0);
    if (rawLowerCost > 0) {
      const scale = budgetLower / rawLowerCost;
      lowerRanges.forEach(r => {
        r.prize = Math.max(ROUND(r.prize * scale), ROUND(entryFee + 0.01));
      });
    }
  }

  // ── Refund zone ─────────────────────────────────────────────────────────────
  const refundRanges = W_refund > 0
    ? [{ from: W_prize + 1, to: W_total, count: W_refund, prize: entryFee, zone: "refund" }]
    : [];

  // ── Assemble + enforce monotonic ───────────────────────────────────────────
  const allRanges = [
    ...top10,
    ...top100Ranges,
    ...midRanges,
    ...lowerRanges,
    ...refundRanges,
  ];
  for (let i = 1; i < allRanges.length; i++) {
    if (allRanges[i].prize > allRanges[i - 1].prize)
      allRanges[i].prize = allRanges[i - 1].prize;
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalPayout     = ROUND(allRanges.reduce((s, r) => s + r.prize * r.count, 0));
  const platformReserve = ROUND(bonusPool - totalPayout);

  // ── Convert to DB slab format ──────────────────────────────────────────────
  // Keep the generated distribution range-compressed. This avoids allocating
  // per-rank rows and keeps DB/HTTP JSON small even for 5,000,000 entries.
  const prize_distribution = compressPrizeSlabs(allRanges);

  // ── Zone summary ───────────────────────────────────────────────────────────
  const zoneLabels = {
    elite:  "Elite (Top 10)",
    top100: "Top 100",
    mid:    "Mid (101–1K)",
    lower:  "Lower",
    refund: "Refund zone",
  };
  const zones = ["elite","top100","mid","lower","refund"].map(z => {
    const zr = allRanges.filter(r => r.zone === z);
    if (!zr.length) return null;
    const count  = zr.reduce((s, r) => s + r.count, 0);
    const payout = ROUND(zr.reduce((s, r) => s + r.prize * r.count, 0));
    return {
      zone:      z,
      name:      zoneLabels[z],
      from:      zr[0].from,
      to:        zr[zr.length - 1].to,
      winners:   count,
      topPrize:  zr[0].prize,
      lastPrize: zr[zr.length - 1].prize,
      payout,
      pctOfPool: ROUND(payout / bonusPool * 100),
    };
  }).filter(Boolean);

  return {
    prize_distribution,
    summary: {
      collected,
      platformFee,
      platformRevenue:  platformFee,
      bonusPool,
      refundCost,
      prizePool,
      totalWinners:     W_total,
      prizeWinners:     W_prize,
      refundWinners:    W_refund,
      rank1Prize:       top10[0].prize,
      rank10Prize:      top10[9].prize,
      rank100Prize:     top100Ranges[top100Ranges.length - 1].prize,
      totalPayout,
      platformReserve,
      winnerPercent,
      prizePercent:     PRIZE_PCT * 100,
    },
    zones,
  };
}

// ─── getPrizeForRankV2 ────────────────────────────────────────────────────────

/**
 * Look up prize amount for a given rank from stored prize_distribution JSON.
 *
 * @param {number}        rank
 * @param {string|Array}  prizeDistribution
 * @param {number}        entryFee
 * @param {number}        totalWinners
 * @returns {number}
 */
export const getPrizeForRankV2 = (rank, prizeDistribution, entryFee, totalWinners) => {
  if (!rank || rank <= 0)  return 0;
  if (rank > totalWinners) return 0;
  if (!prizeDistribution)  return 0;

  let tiers;
  try {
    tiers = typeof prizeDistribution === "string"
      ? JSON.parse(prizeDistribution)
      : prizeDistribution;
  } catch {
    return 0;
  }

  const tier = tiers.find(t => {
    const from = slabStart(t);
    const to = slabEnd(t);
    return from !== undefined && to !== undefined && rank >= from && rank <= to;
  });
  if (tier) return Number(slabPrize(tier)) || 0;

  return 0;
};

// ─── validateDistribution ─────────────────────────────────────────────────────

/**
 * Sanity-check a built distribution.
 * @param {object} distribution  - Output of buildPrizeDistribution()
 * @returns {{ ok: boolean, violations: string[] }}
 */
export const validateDistribution = (distribution) => {
  const violations = [];
  const slabs = distribution.prize_distribution;
  const s     = distribution.summary;

  if (!slabs?.length) {
    violations.push("prize_distribution is empty");
    return { ok: false, violations };
  }

  const r1 = slabs.find(sl => slabStart(sl) <= 1 && slabEnd(sl) >= 1);
  const r2 = slabs.find(sl => slabStart(sl) <= 2 && slabEnd(sl) >= 2);
  if (r1 && r2 && slabPrize(r1) <= slabPrize(r2))
    violations.push(`Rank 1 (${slabPrize(r1)}) must be > Rank 2 (${slabPrize(r2)})`);

  if (s.totalPayout > s.bonusPool + 1)
    violations.push(`Total payout £${s.totalPayout} exceeds bonus pool £${s.bonusPool}`);

  if (!s.rank1Prize || s.rank1Prize <= 0)
    violations.push("Rank 1 prize is zero or negative");

  if (s.rank100Prize <= 0)
    violations.push("Rank 100 prize is zero");

  return { ok: violations.length === 0, violations };
};
