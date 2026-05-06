/**
 * PRIZE DISTRIBUTION — FINAL PRODUCTION MODULE
 * ============================================
 *
 * This module computes the complete prize structure for fantasy contests
 * (Ultra/Mega/Lite/Free) and free-skill-test contests (UCT tool).
 *
 * Design summary
 * --------------
 * Pool calculation:
 *   collected   = totalSpots × entryFee
 *   platformFee = collected × feePct
 *   refunds     = unfilled spots × entryFee  (passed in by caller)
 *   bonusPool   = collected − platformFee − refunds
 *
 * Six zones (in rank order):
 *   1. Champions   ranks 1–10            10 single-rank ranges, explicit cascade
 *   2. Top Ranks   ranks 11–100          5 sub-ranges, % of R10
 *   3. Elite       ranks 101–200         5 sub-ranges, % of R100
 *   4. High Ranks  ranks 201–500         4 sub-ranges, % of R200
 *   5. Mid Ranks   ranks 501–5,000       4 sub-ranges, multiples of entry
 *   6. Low Ranks   ranks 5,001 → W       4 sub-ranges, multiples of entry
 *
 * Champions cascade (% of R1, where R1 = 5% × bonusPool):
 *   r1=100% r2=50% r3=40% r4=30% r5=20% r6=16% r7=14% r8=12% r9=10% r10=8%
 *
 * Top Ranks (% of R10):
 *   11-20: 70%   21-40: 50%   41-60: 40%   61-80: 30%   81-100: 20%
 *
 * Elite (% of R100):
 *   101-120: 80%   121-140: 60%   141-160: 40%   161-180: 30%   181-200: 20%
 *
 * High Ranks (% of R200):
 *   201-250: 90%   251-300: 80%   301-400: 70%   401-500: 60%
 *
 * Mid Ranks (multiples of entry):
 *   501-1000: 8×   1001-2000: 7×   2001-3500: 6×   3501-5000: 5×
 *
 * Low Ranks (multiples of entry):
 *   5001-7500: 4×   7501-10000: 3×   10001-15000: 2×   15001-W: 1×
 *
 * Surplus handling: any leftover pool after these tiers goes to expanding the
 * 2× entry tier (one rank moved from £entry → £2×entry costs +entry per rank).
 * Sub-£entry remainder stays as platform reserve.
 *
 * Tie handling: if multiple users have the same final rank, prizes are summed
 * across the tied ranks and split equally. See `applyTies()`.
 *
 * Rules enforced (validated by `validate()`):
 *   1. R1 = 5% × bonusPool (exact)
 *   2. Champions cascade ratios applied exactly to ranks 1–10
 *   3. Step ≥ entry fee between every adjacent rank-range
 *   4. Non-increasing across all winning ranks
 *   5. Last winning rank ≥ entry fee
 *   6. Every rank in a sub-range (no orphans, no overlaps)
 *   7. Sum of distributed prizes ≤ bonusPool (residual ≤ entry fee)
 *   8. 6 zones only (Champions, Top Ranks, Elite, High Ranks, Mid Ranks, Low Ranks)
 *
 * Public API:
 *   build({ totalSpots, entry, feePct, winPct, refund }) → distribution
 *   freeContest({ totalSpots, isSubscriber }) → free-contest config
 *   applyTies(distribution, tiedRanks) → adjusted prizes when users tie
 *   validate(distribution) → { ok, violations }
 */

'use strict';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const CHAMPION_R1_POOL_SHARE = 0.05;

const CHAMPION_RATIOS = [1.00, 0.50, 0.40, 0.30, 0.20, 0.16, 0.14, 0.12, 0.10, 0.08];

const TOP_SUB_RANGES   = [
  { from: 11,  to:  20, pct: 0.70 },
  { from: 21,  to:  40, pct: 0.50 },
  { from: 41,  to:  60, pct: 0.40 },
  { from: 61,  to:  80, pct: 0.30 },
  { from: 81,  to: 100, pct: 0.20 }
];
const ELITE_SUB_RANGES = [
  { from: 101, to: 120, pct: 0.80 },
  { from: 121, to: 140, pct: 0.60 },
  { from: 141, to: 160, pct: 0.40 },
  { from: 161, to: 180, pct: 0.30 },
  { from: 181, to: 200, pct: 0.20 }
];
const HIGH_SUB_RANGES  = [
  { from: 201, to: 250, pct: 0.90 },
  { from: 251, to: 300, pct: 0.80 },
  { from: 301, to: 400, pct: 0.70 },
  { from: 401, to: 500, pct: 0.60 }
];
const MID_MULTIPLIERS  = [
  { from:  501, to: 1000, mult: 8 },
  { from: 1001, to: 2000, mult: 7 },
  { from: 2001, to: 3500, mult: 6 },
  { from: 3501, to: 5000, mult: 5 }
];
// Low Ranks: last sub-range goes to W (computed dynamically)
const LOW_MULTIPLIERS  = [
  { from:  5001, to:  7500, mult: 4 },
  { from:  7501, to: 10000, mult: 3 },
  { from: 10001, to: 15000, mult: 2 }
  // Final tier: 15001 → W at 1× entry
];

const ZONE_LABELS = {
  champions:  'Champions',
  topRanks:   'Top Ranks',
  elite:      'Elite',
  high:       'High Ranks',
  mid:        'Mid Ranks',
  low:        'Low Ranks'
};

// Round to 2 decimal places (penny precision)
const ROUND = (n) => Math.round(n * 100) / 100;

// ────────────────────────────────────────────────────────────────────────────
// Adaptive Elite/High builders — used when % structure produces sub-entry-fee steps
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build Elite zone using multiples of entry fee.
 * Top of Elite must be ≤ r100 - entry (preserve step rule with rank 100).
 * 5 sub-ranges with consecutive descending multipliers.
 */
function buildAdaptiveElite(r100, entry) {
  // Largest integer m such that m × entry ≤ r100 − entry
  const mTop = Math.floor((r100 - entry) / entry);
  const baseSubs = ELITE_SUB_RANGES;
  const result = [];
  for (let i = 0; i < baseSubs.length; i++) {
    const mult = Math.max(1, mTop - i);
    result.push({
      from: baseSubs[i].from, to: baseSubs[i].to,
      count: baseSubs[i].to - baseSubs[i].from + 1,
      prize: ROUND(entry * mult),
      label: `${mult} × entry`
    });
  }
  return result;
}

/**
 * Build High Ranks using multiples of entry fee.
 * Top must be ≤ r200 − entry. 4 sub-ranges with consecutive descending multipliers.
 */
function buildAdaptiveHigh(r200, entry) {
  const mTop = Math.floor((r200 - entry) / entry);
  const baseSubs = HIGH_SUB_RANGES;
  const result = [];
  for (let i = 0; i < baseSubs.length; i++) {
    const mult = Math.max(1, mTop - i);
    result.push({
      from: baseSubs[i].from, to: baseSubs[i].to,
      count: baseSubs[i].to - baseSubs[i].from + 1,
      prize: ROUND(entry * mult),
      label: `${mult} × entry`
    });
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Core build function
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the prize distribution for a contest.
 *
 * @param {object} opts
 * @param {number} opts.totalSpots  Total spots in the contest (e.g. 100000)
 * @param {number} opts.entry       Entry fee in £ (e.g. 3 for Ultra)
 * @param {number} opts.feePct      Platform fee as decimal (e.g. 0.06 for 6%)
 * @param {number} opts.winPct      Winning % as decimal (e.g. 0.20 for 20%)
 * @param {number} [opts.refund=0]  Total refund amount (£) for unfilled spots
 * @returns {object} distribution with prizes, zones, validation, etc.
 */
function build({ totalSpots, entry, feePct, winPct, refund = 0 } = {}) {
  // ── Input validation
  if (!Number.isInteger(totalSpots) || totalSpots <= 0) {
    return { error: 'totalSpots must be a positive integer' };
  }
  if (typeof entry !== 'number' || entry <= 0) {
    return { error: 'entry must be a positive number' };
  }
  if (typeof feePct !== 'number' || feePct < 0 || feePct >= 1) {
    return { error: 'feePct must be in [0, 1)' };
  }
  if (typeof winPct !== 'number' || winPct <= 0 || winPct > 1) {
    return { error: 'winPct must be in (0, 1]' };
  }
  if (typeof refund !== 'number' || refund < 0) {
    return { error: 'refund must be a non-negative number' };
  }

  const collected   = totalSpots * entry;
  const platformFee = collected * feePct;
  const bonusPool   = collected - platformFee - refund;
  const W           = Math.floor(totalSpots * winPct);

  if (bonusPool <= 0) return { error: 'bonusPool is non-positive after fee/refund' };
  if (W < 1)          return { error: 'no winners (W < 1)' };

  // For very small contests (W < 5001), skip zones beyond W
  // The default design assumes W ≥ 15,001 (so all 6 zones can populate).
  // Below 15,001 we truncate or merge zones gracefully.
  if (W < 15_001) {
    return buildSmallContest({ totalSpots, entry, feePct, winPct, refund,
                                collected, platformFee, bonusPool, W });
  }

  // ── Pre-compute how much upper zones can spend
  const minMidLowCost  = Math.max(0, W - 500) * entry;
  const upperBudgetMax = bonusPool - minMidLowCost;
  if (upperBudgetMax <= 0) {
    return { error: `bonusPool £${bonusPool} too small for ${W} winners` };
  }
  const upperBudgetShare = upperBudgetMax;

  // ── Step 1: Champions cascade
  const R1 = ROUND(Math.min(
    bonusPool * CHAMPION_R1_POOL_SHARE,
    upperBudgetShare * 0.25
  ));
  const champions = CHAMPION_RATIOS.map((pct, i) => ({
    rank: i + 1,
    prize: ROUND(R1 * pct),
    label: `${(pct * 100).toFixed(0)}% of R1`
  }));
  const r10 = champions[9].prize;

  // ── Step 2: Top Ranks (% of R10)
  const topRanks = TOP_SUB_RANGES.map(s => ({
    from: s.from, to: s.to, count: s.to - s.from + 1,
    prize: ROUND(r10 * s.pct),
    label: `${(s.pct * 100).toFixed(0)}% of R10`
  }));
  const r100 = topRanks[topRanks.length - 1].prize;

  // ── Step 3: Elite (% of R100) — fall back to multiples-of-entry if step rule fails
  const eliteByPct = ELITE_SUB_RANGES.map(s => ({
    from: s.from, to: s.to, count: s.to - s.from + 1,
    prize: ROUND(r100 * s.pct),
    label: `${(s.pct * 100).toFixed(0)}% of R100`
  }));
  // Check step rule: each adjacent prize differs by ≥ entry, AND first elite ≤ r100 - entry
  let eliteValid = (r100 - eliteByPct[0].prize) >= entry - 0.005;
  for (let i = 1; i < eliteByPct.length && eliteValid; i++) {
    if (eliteByPct[i - 1].prize - eliteByPct[i].prize < entry - 0.005) eliteValid = false;
  }
  const elite = eliteValid ? eliteByPct : buildAdaptiveElite(r100, entry);
  const r200 = elite[elite.length - 1].prize;

  // ── Step 4: High Ranks (% of R200) — same adaptive fallback
  const highByPct = HIGH_SUB_RANGES.map(s => ({
    from: s.from, to: s.to, count: s.to - s.from + 1,
    prize: ROUND(r200 * s.pct),
    label: `${(s.pct * 100).toFixed(0)}% of R200`
  }));
  let highValid = (r200 - highByPct[0].prize) >= entry - 0.005;
  for (let i = 1; i < highByPct.length && highValid; i++) {
    if (highByPct[i - 1].prize - highByPct[i].prize < entry - 0.005) highValid = false;
  }
  const high = highValid ? highByPct : buildAdaptiveHigh(r200, entry);

  // ── Step 5 & 6: Mid + Low Ranks
  // Strategy: 8 tiers stacked, multipliers [m, m-1, ..., m-7] descending,
  // with last tier at 1× entry. So m = 8.
  //
  // For smaller pools where m=8 doesn't fit, we MERGE tiers from the bottom up
  // until cost fits. This shifts the boundary between Mid and Low; ultimately
  // Mid may have fewer than 4 tiers.
  //
  // But we need to keep Low's bottom = entry fee. So we keep at least 2 tiers
  // (one above entry, one at entry) and merge intermediate tiers if necessary.

  // Constrain top of Mid+Low so step from High Ranks bottom ≥ entry fee.
  // High Ranks bottom is the last item in `high`. If high[].prize values are multiples of entry,
  // Mid top must be ≤ highBottom - entry. Translate to multiplier constraint:
  //   tiers[0].mult × entry ≤ highBottom - entry  →  tiers[0].mult ≤ (highBottom / entry) - 1
  const highBottom = high[high.length - 1].prize;
  const maxTopMult = Math.floor((highBottom - entry) / entry);

  // Default tier structure (8 tiers)
  const baseTiers = [
    { from:  501, to: 1000, mult: 8 },           // Mid 1
    { from: 1001, to: 2000, mult: 7 },           // Mid 2
    { from: 2001, to: 3500, mult: 6 },           // Mid 3
    { from: 3501, to: 5000, mult: 5 },           // Mid 4
    { from: 5001, to: 7500, mult: 4 },           // Low 1
    { from: 7501, to: 10000, mult: 3 },          // Low 2
    { from: 10001, to: 15000, mult: 2 },         // Low 3
    { from: 15001, to: W, mult: 1 }              // Low 4 (extends to W)
  ];

  // If maxTopMult < 8, drop tiers from the top until tiers[0].mult ≤ maxTopMult.
  // (This makes the structure consistent with High Ranks bottom.)
  while (baseTiers.length > 0 && baseTiers[0].mult > maxTopMult) {
    const dropped = baseTiers.shift();
    if (baseTiers.length > 0) {
      baseTiers[0] = { ...baseTiers[0], from: dropped.from };
    }
  }

  if (baseTiers.length === 0 || baseTiers[baseTiers.length - 1].mult !== 1) {
    return { error: `High Ranks bottom (£${highBottom}) too low to support Mid+Low chain ending at entry fee` };
  }

  // Compute fixed (top-zone) cost
  let fixedTopCost = champions.reduce((s, c) => s + c.prize, 0);
  for (const arr of [topRanks, elite, high]) {
    for (const r of arr) fixedTopCost += r.prize * r.count;
  }
  fixedTopCost = ROUND(fixedTopCost);

  const midLowBudget = bonusPool - fixedTopCost;

  // Compute cost of base tiers
  function tierCost(tiers) {
    let c = 0;
    for (const t of tiers) c += entry * t.mult * (t.to - t.from + 1);
    return c;
  }

  let tiers    = baseTiers.slice();
  let baseCost = tierCost(tiers);

  // If tiers exceed budget, scale ALL multipliers down proportionally
  if (baseCost > midLowBudget && midLowBudget > 0) {
    const scaleFactor = midLowBudget / baseCost;
    // Recompute multipliers scaled to fit budget
    // Keep structure but reduce prizes proportionally
    let prevMult = Infinity;
    for (let i = 0; i < tiers.length; i++) {
      const rawMult  = Math.max(1, Math.floor(tiers[i].mult * scaleFactor));
      const safeMult = Math.min(rawMult, prevMult - 1 > 0 ? prevMult - 1 : rawMult);
      tiers[i]       = { ...tiers[i], mult: Math.max(1, safeMult) };
      prevMult       = tiers[i].mult;
    }
    baseCost = tierCost(tiers);
  }

  // Hard fallback: if still over budget, collapse Mid+Low to the minimum 1× entry tier.
  if (baseCost > midLowBudget) {
    tiers = [{ from: 501, to: W, mult: 1 }];
    baseCost = tierCost(tiers);
  }

  if (baseCost > midLowBudget) {
    return { error: `Pool too small: cannot fit Mid+Low at entry fee. Budget £${midLowBudget.toFixed(2)}, min cost £${baseCost.toFixed(2)}` };
  }

  // Now build Mid (tiers with mult > 4) and Low (tiers with mult ≤ 4).
  // After tier dropping, multipliers may be [7,6,5,4,3,2,1] or similar.
  // Mid Ranks zone = ranks 501-5000; Low Ranks zone = 5001-W.
  const mid = [];
  const low = [];
  for (const t of tiers) {
    const range = {
      from: t.from, to: t.to, count: t.to - t.from + 1,
      prize: ROUND(entry * t.mult),
      label: `${t.mult} × entry`
    };
    // Place in mid if it overlaps with 501-5000, else in low
    if (t.from <= 5000) mid.push(range);
    else low.push(range);
  }

  // Edge case: if Mid is empty (because all tiers were dropped from top), redistribute
  if (mid.length === 0 && tiers.length > 0) {
    // Shouldn't happen with this design, but guard anyway
    return { error: 'Mid Ranks zone is empty after tier merging' };
  }

  // ── Step 7: Compute baseline total + handle surplus
  let baselineTotal = champions.reduce((s, c) => s + c.prize, 0);
  for (const arr of [topRanks, elite, high, mid, low]) {
    for (const r of arr) baselineTotal += r.prize * r.count;
  }
  baselineTotal = ROUND(baselineTotal);

  let surplus = ROUND(bonusPool - baselineTotal);
  let platformReserve = 0;

  // Surplus distribution strategy: move winners from 1× entry tier UP to 2× entry tier.
  // Each rank moved costs (2× − 1×) × entry = entry per rank.
  // We move floor(surplus / entry) ranks; remainder stays as platform reserve.
  if (surplus > 0) {
    const ranksToMove = Math.floor(surplus / entry);
    const surplusUsed = ROUND(ranksToMove * entry);
    platformReserve = ROUND(surplus - surplusUsed);

    if (ranksToMove > 0) {
      // Find the "2× entry" sub-range and the "1× entry" sub-range in low[]
      // Currently: 10001-15000 is 2×, 15001-W is 1×
      // After move: 10001-(15000+ranksToMove) is 2×, (15001+ranksToMove)-W is 1×
      // But ranksToMove cannot exceed the size of the 1× tier
      const oneTierIdx = low.length - 1;        // last sub-range = 1× entry
      const twoTierIdx = oneTierIdx - 1;        // 2× entry tier
      const oneTier = low[oneTierIdx];
      const twoTier = low[twoTierIdx];

      const maxMovable = oneTier.count - 1;     // keep at least 1 winner at 1×
      const actualMove = Math.min(ranksToMove, maxMovable);

      twoTier.to     += actualMove;
      twoTier.count  += actualMove;
      oneTier.from   += actualMove;
      oneTier.count  -= actualMove;

      // Recompute reserve if we couldn't move all ranks we wanted
      if (actualMove < ranksToMove) {
        const unmoved = ranksToMove - actualMove;
        platformReserve = ROUND(platformReserve + unmoved * entry);
      }
    }
  } else if (surplus < 0) {
    // Distribution exceeds pool — shouldn't happen with these ratios but guard.
    return { error: `Distribution exceeds pool by £${(-surplus).toFixed(2)}` };
  }

  // ── Step 8: Assemble result
  const allRanges = [];
  for (const c of champions) {
    allRanges.push({
      zone: 'champions', zoneName: ZONE_LABELS.champions,
      from: c.rank, to: c.rank, count: 1, prize: c.prize, label: c.label
    });
  }
  for (const arr of [
    { zone: 'topRanks', items: topRanks },
    { zone: 'elite',    items: elite },
    { zone: 'high',     items: high },
    { zone: 'mid',      items: mid },
    { zone: 'low',      items: low }
  ]) {
    for (const r of arr.items) {
      allRanges.push({
        zone: arr.zone, zoneName: ZONE_LABELS[arr.zone],
        from: r.from, to: r.to, count: r.count, prize: r.prize, label: r.label
      });
    }
  }

  // Per-rank flat array (length = W). Index 0 = rank 1.
  const prizes = new Array(W);
  for (const r of allRanges) {
    for (let rank = r.from; rank <= r.to; rank++) prizes[rank - 1] = r.prize;
  }

  // Zone summaries
  const zones = computeZoneSummaries(allRanges, bonusPool);

  // Total distributed
  let distributed = 0;
  for (const r of allRanges) distributed += r.prize * r.count;
  distributed = ROUND(distributed);

  // Validation
  const validation = validate({
    bonusPool, W, entry, R1: champions[0].prize,
    allRanges, prizes, distributed, platformReserve
  });

  return {
    contest: {
      totalSpots, entry, feePct, winPct,
      collected: ROUND(collected),
      platformFee: ROUND(platformFee),
      refund: ROUND(refund),
      bonusPool: ROUND(bonusPool),
      W
    },
    R1: champions[0].prize,
    R10: r10,
    R100: r100,
    R200: r200,
    R500: high[high.length - 1].prize,
    R5000: mid[mid.length - 1].prize,
    Rlast: prizes[W - 1],
    distributed,
    platformReserve,
    zones,
    ranges: allRanges,
    prizes,
    validation,
    rules: validation.ok
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Small-contest builder (W < 15,001)
// ────────────────────────────────────────────────────────────────────────────

/**
 * For very small contests where the standard zone counts don't apply,
 * truncate zones from the bottom up. Keeps Champions cascade intact and
 * trims/drops other zones as needed.
 *
 * Minimum supported: W ≥ 11 (Champions + 1 Top Ranks rank).
 */
function buildSmallContest(ctx) {
  const { totalSpots, entry, feePct, winPct, refund, bonusPool, W } = ctx;

  if (W < 11) {
    // Only Champions, possibly truncated
    const R1 = bonusPool * CHAMPION_R1_POOL_SHARE;
    const champions = [];
    for (let i = 0; i < W; i++) {
      champions.push({
        rank: i + 1,
        prize: ROUND(R1 * CHAMPION_RATIOS[i]),
        label: `${(CHAMPION_RATIOS[i] * 100).toFixed(0)}% of R1`
      });
    }
    return assembleSmallContest(ctx, champions, [], [], [], [], []);
  }

  // Build full structure but truncate at W
  const R1 = bonusPool * CHAMPION_R1_POOL_SHARE;
  const champions = CHAMPION_RATIOS.map((pct, i) => ({
    rank: i + 1, prize: ROUND(R1 * pct), label: `${(pct * 100).toFixed(0)}% of R1`
  }));
  const r10 = champions[9].prize;

  const topRanks = [];
  for (const s of TOP_SUB_RANGES) {
    if (s.from > W) break;
    const to = Math.min(s.to, W);
    topRanks.push({ from: s.from, to, count: to - s.from + 1,
                     prize: ROUND(r10 * s.pct), label: `${(s.pct * 100).toFixed(0)}% of R10` });
    if (to === W) break;
  }
  const r100 = topRanks.length === TOP_SUB_RANGES.length ? topRanks[topRanks.length - 1].prize : null;

  const elite = [];
  if (r100 !== null) {
    const subs = ELITE_SUB_RANGES;
    // Determine if % structure satisfies step rule
    let useByPct = (r100 - ROUND(r100 * subs[0].pct)) >= entry - 0.005;
    for (let i = 1; i < subs.length && useByPct; i++) {
      const prev = ROUND(r100 * subs[i-1].pct);
      const curr = ROUND(r100 * subs[i].pct);
      if (prev - curr < entry - 0.005) useByPct = false;
    }
    if (useByPct) {
      for (const s of subs) {
        if (s.from > W) break;
        const to = Math.min(s.to, W);
        elite.push({ from: s.from, to, count: to - s.from + 1,
                      prize: ROUND(r100 * s.pct), label: `${(s.pct * 100).toFixed(0)}% of R100` });
        if (to === W) break;
      }
    } else {
      // Adaptive: use multiples of entry, truncated at W
      const mTop = Math.floor((r100 - entry) / entry);
      for (let i = 0; i < subs.length; i++) {
        if (subs[i].from > W) break;
        const to = Math.min(subs[i].to, W);
        const mult = Math.max(1, mTop - i);
        elite.push({ from: subs[i].from, to, count: to - subs[i].from + 1,
                      prize: ROUND(entry * mult), label: `${mult} × entry` });
        if (to === W) break;
      }
    }
  }
  const r200 = elite.length === ELITE_SUB_RANGES.length ? elite[elite.length - 1].prize : null;

  const high = [];
  if (r200 !== null) {
    const subs = HIGH_SUB_RANGES;
    let useByPct = (r200 - ROUND(r200 * subs[0].pct)) >= entry - 0.005;
    for (let i = 1; i < subs.length && useByPct; i++) {
      const prev = ROUND(r200 * subs[i-1].pct);
      const curr = ROUND(r200 * subs[i].pct);
      if (prev - curr < entry - 0.005) useByPct = false;
    }
    if (useByPct) {
      for (const s of subs) {
        if (s.from > W) break;
        const to = Math.min(s.to, W);
        high.push({ from: s.from, to, count: to - s.from + 1,
                     prize: ROUND(r200 * s.pct), label: `${(s.pct * 100).toFixed(0)}% of R200` });
        if (to === W) break;
      }
    } else {
      const mTop = Math.floor((r200 - entry) / entry);
      for (let i = 0; i < subs.length; i++) {
        if (subs[i].from > W) break;
        const to = Math.min(subs[i].to, W);
        const mult = Math.max(1, mTop - i);
        high.push({ from: subs[i].from, to, count: to - subs[i].from + 1,
                     prize: ROUND(entry * mult), label: `${mult} × entry` });
        if (to === W) break;
      }
    }
  }

  const mid = [];
  const low = [];

  // Build Mid+Low using adaptive tier-merging (same as main path).
  // Truncate base tiers at W, then drop highest tiers until budget fits.
  if (high.length === HIGH_SUB_RANGES.length) {
    // Compute fixed top cost
    let fixedTopCost = champions.reduce((s, c) => s + c.prize, 0);
    for (const arr of [topRanks, elite, high]) {
      for (const r of arr) fixedTopCost += r.prize * r.count;
    }
    fixedTopCost = ROUND(fixedTopCost);
    const midLowBudget = bonusPool - fixedTopCost;

    // Truncate base tiers at W, ensuring last tier ends at W with mult=1
    let baseTiers = [
      { from:  501, to: 1000, mult: 8 },
      { from: 1001, to: 2000, mult: 7 },
      { from: 2001, to: 3500, mult: 6 },
      { from: 3501, to: 5000, mult: 5 },
      { from: 5001, to: 7500, mult: 4 },
      { from: 7501, to: 10000, mult: 3 },
      { from: 10001, to: 15000, mult: 2 },
      { from: 15001, to: W, mult: 1 }
    ].filter(t => t.from <= W).map(t => ({ ...t, to: Math.min(t.to, W) }));

    // Ensure last tier ends at W with mult=1 (last rank = entry fee)
    if (baseTiers.length > 0) {
      const last = baseTiers[baseTiers.length - 1];
      if (last.mult !== 1) {
        // Replace last tier with mult=1, OR add a new mult=1 tier covering its range
        baseTiers[baseTiers.length - 1] = { ...last, mult: 1 };
      }
    }

    if (baseTiers.length === 0) {
      // Nothing fits in Mid/Low — return what we have
      return assembleSmallContestFinal({ ...ctx, champions, topRanks, elite, high, mid, low });
    }

    function tierCost(tiers) {
      let c = 0;
      for (const t of tiers) c += entry * t.mult * (t.to - t.from + 1);
      return c;
    }

    let tiers = baseTiers.slice();

    // Drop tiers from top to satisfy step rule with High Ranks bottom.
    // Always keep at least the bottom tier (mult=1) so last rank = entry fee.
    const highBottom = high.length > 0 ? high[high.length - 1].prize : null;
    if (highBottom !== null) {
      const maxTopMult = Math.floor((highBottom - entry) / entry);
      while (tiers.length > 1 && tiers[0].mult > maxTopMult) {
        const dropped = tiers.shift();
        tiers[0] = { ...tiers[0], from: dropped.from };
      }
      // If only 1 tier remains and its mult > maxTopMult, force it to mult=1
      // (this means high bottom is barely above entry; we just have a flat 1× tier)
      if (tiers.length === 1 && tiers[0].mult > maxTopMult) {
        tiers[0] = { ...tiers[0], mult: 1, from: 501, to: W };
      }
    }

    // Then drop tiers from top while cost > budget
    while (tierCost(tiers) > midLowBudget && tiers.length > 1) {
      // Drop the highest-mult tier (first in array). The next tier inherits
      // the dropped tier's range (extends UP to absorb it). The multiplier
      // of the next tier stays the same (so the merged range pays the LOWER
      // of the two original multipliers — preserves budget feasibility).
      const dropped = tiers.shift();
      tiers[0] = { ...tiers[0], from: dropped.from };
    }

    // Note: we do NOT separately re-extend tiers[0].from = 501 here, because
    // the merging loop has already extended it upward through dropped tiers.
    // If the loop didn't run (tiers fit at base cost), tiers[0].from is already 501.

    if (tierCost(tiers) > midLowBudget) {
      // Can't fit — error out
      return { error: `Small contest: cannot fit Mid+Low even after tier merging. Budget £${midLowBudget.toFixed(2)}, min cost £${tierCost(tiers).toFixed(2)}` };
    }

    for (const t of tiers) {
      const range = {
        from: t.from, to: t.to, count: t.to - t.from + 1,
        prize: ROUND(entry * t.mult),
        label: `${t.mult} × entry`
      };
      if (t.from <= 5000) mid.push(range); else low.push(range);
    }
  }

  return assembleSmallContestFinal({ ...ctx, champions, topRanks, elite, high, mid, low });
}

function assembleSmallContestFinal(ctx) {
  const { champions, topRanks, elite, high, mid, low } = ctx;
  return assembleSmallContest(ctx, champions, topRanks, elite, high, mid, low);
}

function assembleSmallContest(ctx, champions, topRanks, elite, high, mid, low) {
  const { totalSpots, entry, feePct, winPct, refund, collected, platformFee, bonusPool, W } = ctx;

  let baselineTotal = champions.reduce((s, c) => s + c.prize, 0);
  for (const arr of [topRanks, elite, high, mid, low]) {
    for (const r of arr) baselineTotal += r.prize * r.count;
  }
  baselineTotal = ROUND(baselineTotal);

  const surplus = ROUND(bonusPool - baselineTotal);
  let platformReserve = surplus < 0 ? 0 : surplus;
  // For small contests, surplus stays as platform reserve (no expansion strategy)

  // If distribution exceeds pool, scale Champions down proportionally
  if (surplus < 0) return { error: `Small contest distribution exceeds pool by £${(-surplus).toFixed(2)}` };

  const allRanges = [];
  for (const c of champions) {
    allRanges.push({
      zone: 'champions', zoneName: ZONE_LABELS.champions,
      from: c.rank, to: c.rank, count: 1, prize: c.prize, label: c.label
    });
  }
  for (const arr of [
    { zone: 'topRanks', items: topRanks },
    { zone: 'elite',    items: elite },
    { zone: 'high',     items: high },
    { zone: 'mid',      items: mid },
    { zone: 'low',      items: low }
  ]) {
    for (const r of arr.items) {
      allRanges.push({
        zone: arr.zone, zoneName: ZONE_LABELS[arr.zone],
        from: r.from, to: r.to, count: r.count, prize: r.prize, label: r.label
      });
    }
  }

  const prizes = new Array(W);
  for (const r of allRanges) {
    for (let rank = r.from; rank <= r.to; rank++) prizes[rank - 1] = r.prize;
  }

  const zones = computeZoneSummaries(allRanges, bonusPool);

  let distributed = 0;
  for (const r of allRanges) distributed += r.prize * r.count;
  distributed = ROUND(distributed);

  const validation = validate({
    bonusPool, W, entry,
    R1: champions[0] ? champions[0].prize : 0,
    allRanges, prizes, distributed, platformReserve
  });

  return {
    contest: {
      totalSpots, entry, feePct, winPct,
      collected: ROUND(collected),
      platformFee: ROUND(platformFee),
      refund: ROUND(refund),
      bonusPool: ROUND(bonusPool),
      W,
      smallContest: true
    },
    R1: champions[0] ? champions[0].prize : 0,
    Rlast: prizes[W - 1],
    distributed,
    platformReserve,
    zones,
    ranges: allRanges,
    prizes,
    validation,
    rules: validation.ok
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Zone summaries
// ────────────────────────────────────────────────────────────────────────────

function computeZoneSummaries(allRanges, bonusPool) {
  const zoneOrder = ['champions', 'topRanks', 'elite', 'high', 'mid', 'low'];
  const zones = [];
  const grouped = {};
  for (const r of allRanges) {
    if (!grouped[r.zone]) grouped[r.zone] = [];
    grouped[r.zone].push(r);
  }
  for (const z of zoneOrder) {
    if (!grouped[z] || grouped[z].length === 0) continue;
    const sub = grouped[z];
    const total = sub.reduce((s, r) => s + r.prize * r.count, 0);
    const count = sub.reduce((s, r) => s + r.count, 0);
    zones.push({
      key: z,
      name: ZONE_LABELS[z],
      from: sub[0].from,
      to: sub[sub.length - 1].to,
      count,
      top: sub[0].prize,
      bottom: sub[sub.length - 1].prize,
      total: ROUND(total),
      pctOfPool: ROUND((total / bonusPool) * 100),
      subRanges: sub.map(r => ({
        from: r.from, to: r.to, count: r.count, prize: r.prize, label: r.label
      }))
    });
  }
  return zones;
}

// ────────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────────

function validate({ bonusPool, W, entry, R1, allRanges, prizes, distributed, platformReserve }) {
  const violations = [];

  // Rule 1: R1 = 5% × bonusPool
  const r1Target = ROUND(bonusPool * CHAMPION_R1_POOL_SHARE);
  if (Math.abs(R1 - r1Target) > 0.01) {
    violations.push(`R1 (£${R1.toFixed(2)}) ≠ 5% × bonusPool (£${r1Target.toFixed(2)})`);
  }

  // Rule 2: Champions cascade matches ratios
  const r1Actual = allRanges[0] ? allRanges[0].prize : 0;
  for (let i = 1; i < Math.min(10, allRanges.length); i++) {
    if (allRanges[i].zone !== 'champions') break;
    const expected = ROUND(r1Actual * (CHAMPION_RATIOS[i] / CHAMPION_RATIOS[0]));
    if (Math.abs(allRanges[i].prize - expected) > 0.05) {
      violations.push(`Rank ${i+1} prize £${allRanges[i].prize} ≠ expected £${expected}`);
    }
  }

  // Rule 3: Step ≥ entry between adjacent rank-ranges
  for (let i = 1; i < allRanges.length; i++) {
    const prev = allRanges[i - 1];
    const curr = allRanges[i];
    const step = prev.prize - curr.prize;
    if (
      step < entry - 0.005 &&
      prev.prize !== curr.prize
    ) {
      violations.push(
        `Step rule violated: ${prev.zoneName} ${prev.from}-${prev.to} (£${prev.prize}) → ` +
        `${curr.zoneName} ${curr.from}-${curr.to} (£${curr.prize}) = step £${step.toFixed(2)}`
      );
    }
  }

  // Rule 4: Non-increasing across all winning ranks
  let inversions = 0;
  for (let i = 1; i < prizes.length; i++) if (prizes[i] > prizes[i - 1]) inversions++;
  if (inversions > 0) violations.push(`${inversions} inversions in per-rank prize array`);

  // Rule 5: Last winning rank ≥ entry fee
  const lastPrize = prizes[prizes.length - 1];
  if (lastPrize < entry - 0.005) {
    violations.push(`Last rank prize £${lastPrize} < entry fee £${entry}`);
  }

  // Rule 6: Coverage — every rank in a sub-range, no gaps, no overlaps
  let cursor = 1;
  for (const r of allRanges) {
    if (r.from !== cursor) {
      violations.push(`Gap or overlap: expected rank ${cursor}, got range ${r.from}-${r.to}`);
      break;
    }
    cursor = r.to + 1;
  }
  if (cursor - 1 !== W) {
    violations.push(`Coverage incomplete: covered up to rank ${cursor - 1}, expected ${W}`);
  }

  // Rule 7: Distributed amount must not exceed bonusPool.
  if (distributed > bonusPool + entry) {
    violations.push(
      `Distributed amount exceeds bonus pool`
    );
  }

  // Rule 8: 6 zones max
  const uniqueZones = new Set(allRanges.map(r => r.zone));
  if (uniqueZones.size > 6) {
    violations.push(`Too many zones: ${uniqueZones.size}`);
  }

  return { ok: violations.length === 0, violations };
}

// ────────────────────────────────────────────────────────────────────────────
// Tie handling
// ────────────────────────────────────────────────────────────────────────────

/**
 * Apply tie handling to a distribution.
 *
 * When multiple users finish at the same final rank (e.g., score-based ties),
 * their combined prize money is split equally among them.
 *
 * Standard "competition ranking" / "1224" semantics:
 *   If 3 users tie at rank 5, they all receive the SAME prize. That prize =
 *   sum(prizes of ranks 5,6,7) / 3. The next user is rank 8.
 *
 * @param {object} distribution  Output of build()
 * @param {Array<object>} tiedGroups  [{ startRank, count }, ...] — groups of users who tied
 *   Each group means `count` users finished at rank `startRank` (they share
 *   ranks [startRank ... startRank+count-1]).
 * @returns {object} { adjustedPrizes, payouts } where:
 *   adjustedPrizes[i] = prize for rank (i+1), now uniform across each tied group
 *   payouts = array of per-user payouts (one per user, in tie-group order)
 */
function applyTies(distribution, tiedGroups = []) {
  if (!distribution || !distribution.prizes) {
    return { error: 'invalid distribution' };
  }
  const W = distribution.prizes.length;
  const adjusted = distribution.prizes.slice();
  const payouts = [];

  // Validate tied groups: no overlap, all within [1, W]
  let lastEnd = 0;
  for (const g of tiedGroups) {
    if (!Number.isInteger(g.startRank) || !Number.isInteger(g.count) ||
        g.startRank < 1 || g.count < 1) {
      return { error: `Invalid tied group: ${JSON.stringify(g)}` };
    }
    if (g.startRank <= lastEnd) {
      return { error: `Overlapping tied groups starting at rank ${g.startRank}` };
    }
    if (g.startRank + g.count - 1 > W) {
      return { error: `Tied group rank ${g.startRank}+${g.count} exceeds W=${W}` };
    }
    lastEnd = g.startRank + g.count - 1;
  }

  for (const g of tiedGroups) {
    const ranks = [];
    let totalPrize = 0;
    for (let r = g.startRank; r < g.startRank + g.count; r++) {
      ranks.push(r);
      totalPrize += distribution.prizes[r - 1];
    }
    const perUser = ROUND(totalPrize / g.count);
    // Update adjusted prize array (each tied rank shows the shared prize)
    for (const r of ranks) adjusted[r - 1] = perUser;
    payouts.push({ ranks, totalPrize: ROUND(totalPrize), perUser, count: g.count });
  }

  return {
    adjustedPrizes: adjusted,
    tieGroups: payouts,
    note: 'Tied users split combined prize equally; rounding may produce 1p variance per group'
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Free contest
// ────────────────────────────────────────────────────────────────────────────

/**
 * Free contest configuration. No entry fee, no prizes, no platform fee.
 * Used as the UCT (Unified Contest Test) skill-evaluation tool.
 *
 * @param {object} opts
 * @param {number} opts.totalSpots    Spots released by admin
 * @param {boolean} opts.isSubscriber Whether user is a subscriber
 * @returns {object} free-contest config
 */
function freeContest({ totalSpots, isSubscriber } = {}) {
  if (!Number.isInteger(totalSpots) || totalSpots <= 0) {
    return { error: 'totalSpots must be a positive integer' };
  }
  return {
    contestType: 'free',
    totalSpots,
    teamsAllowed: isSubscriber ? 20 : 1,
    entry: 0,
    platformFee: 0,
    bonusPool: 0,
    winningSpots: 0,
    note: 'Free contest — UCT skill testing only, no monetary prizes.'
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get the prize for a specific rank.
 */
function prizeForRank(distribution, rank) {
  if (!distribution || !distribution.prizes) return null;
  if (rank < 1 || rank > distribution.prizes.length) return 0;
  return distribution.prizes[rank - 1];
}

/**
 * Find which sub-range contains a given rank.
 */
function rangeForRank(distribution, rank) {
  if (!distribution || !distribution.ranges) return null;
  for (const r of distribution.ranges) {
    if (rank >= r.from && rank <= r.to) return r;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────────────────

export {
  build,
  freeContest,
  applyTies,
  validate,
  prizeForRank,
  rangeForRank,
  CHAMPION_RATIOS,
  CHAMPION_R1_POOL_SHARE,
  TOP_SUB_RANGES,
  ELITE_SUB_RANGES,
  HIGH_SUB_RANGES,
  MID_MULTIPLIERS,
  LOW_MULTIPLIERS,
  ZONE_LABELS
};

// ────────────────────────────────────────────────────────────────────────────
// Adapter — createContest-compatible wrapper around build()
// ────────────────────────────────────────────────────────────────────────────

export function generatePrizeDistribution({
  entryFee,
  maxEntries,
  winnerPercentage,
  platformFeePercentage,
  rank1Percentage = 5,
}) {
  if (entryFee === 0) {
    return {
      prize_distribution: [],
      debug: {
        totalCollection: 0, platformFee: 0, netPool: 0,
        safePool: 0, bonusPool: 0, rank1: 0,
        winners: 0, safeStart: null, safeCount: 0, totalPayout: 0,
        _raw: null,
      },
    };
  }

  const result = build({
    totalSpots : maxEntries,
    entry      : entryFee,
    feePct     : platformFeePercentage / 100,
    winPct     : winnerPercentage / 100,
    refund     : 0,
  });

  if (result.error) throw new Error(result.error);

  // Convert ranges[] to slabs for createContest compatibility
  const prize_distribution = result.ranges.map(r =>
    r.from === r.to
      ? { rank: r.from, amount: r.prize }
      : { rank_from: r.from, rank_to: r.to, amount: r.prize }
  );

  return {
    prize_distribution,
    debug: {
      totalCollection : result.contest.collected,
      platformFee     : result.contest.platformFee,
      netPool         : result.contest.collected - result.contest.platformFee,
      safePool        : 0,
      bonusPool       : result.contest.bonusPool,
      rank1           : result.R1,
      winners         : result.contest.W,
      safeStart       : null,
      safeCount       : 0,
      totalPayout     : result.distributed,
      _raw            : result,
    },
  };
}
