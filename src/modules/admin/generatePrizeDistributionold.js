"use strict";

/**
 * generatePrizeDistribution.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Financial-grade prize distribution engine.
 *
 * STRICT CALCULATION ORDER:
 *   1. totalCollection = maxEntries × entryFee
 *   2. platformFee     = floor(totalCollection × platformFeePercentage / 100)
 *   3. netPool         = totalCollection − platformFee
 *   4. winners         = floor(maxEntries × winnerPercentage / 100)
 *   5. safeCount       = floor(winners × 0.2)
 *      safeStart       = winners − safeCount + 1
 *      safePool        = SUM of smooth-decreasing payouts [min(entryFee×2, bonusTail-1) → entryFee]
 *   6. bonusPool       = netPool − safePool
 *   7. rank1           = floor(bonusPool × rank1Percentage / 100)  ← ONLY from bonusPool
 *
 * FIX v2 (negative residual):
 *   The old two-pass approach built bonus slabs against bonusPoolEstimate, then
 *   applied a delta to rank1 when the real bonusPool differed. If the real bonusPool
 *   was significantly smaller (because the safe zone ceiling cap lowered safePool),
 *   the delta was a large negative number that made rank1 non-positive.
 *
 *   New approach:
 *   1. Compute safePool with ceiling cap = entryFee*2 (no bonus tail known yet).
 *   2. Derive exact bonusPool = netPool − safePool.
 *   3. Build top10 and middle slabs from the EXACT bonusPool.
 *   4. Reconcile bonus slabs to the EXACT bonusPool.
 *   5. Rebuild safe zone with ceiling = bonusTailAmount − 1.
 *   6. If safePool changed, re-reconcile bonus slabs once more to absorb any residual.
 *   This eliminates the estimate/actual mismatch entirely.
 * ─────────────────────────────────────────────────────────────────────────────
 */


/* ═══════════════════════════════════════════════════════════════════════════
   § 1  INPUT VALIDATION
═══════════════════════════════════════════════════════════════════════════ */

function validateInputs(p) {
  const rules = [
    ["entryFee",              v => Number.isFinite(v) && v > 0,              "must be a positive finite number"],
    ["maxEntries",            v => Number.isInteger(v) && v >= 2,            "must be an integer >= 2"],
    ["winnerPercentage",      v => Number.isFinite(v) && v > 0 && v < 100,  "must be > 0 and < 100"],
    ["platformFeePercentage", v => Number.isFinite(v) && v >= 0 && v < 100, "must be >= 0 and < 100"],
    ["rank1Percentage",       v => Number.isFinite(v) && v > 0 && v <= 10,  "must be > 0 and <= 10"],
  ];

  for (const [key, test, msg] of rules) {
    if (!test(p[key])) {
      throw new Error(`[Validation] "${key}" ${msg} — received: ${p[key]}`);
    }
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   § 2  STEPS 1–4 — CORE FINANCIALS
═══════════════════════════════════════════════════════════════════════════ */

function calcCore({ entryFee, maxEntries, winnerPercentage, platformFeePercentage }) {
  const totalCollection = maxEntries * entryFee;
  const platformFee     = Math.floor(totalCollection * platformFeePercentage / 100);
  const netPool         = totalCollection - platformFee;
  const winners         = Math.floor(maxEntries * winnerPercentage / 100);

  if (winners < 2) {
    throw new Error("[Calc] winnerPercentage too low — results in fewer than 2 winners");
  }

//   console.log("netPool:", platformFee, "bonusPool:", netPool);

  return { totalCollection, platformFee, netPool, winners };
}



/* ═══════════════════════════════════════════════════════════════════════════
   § 3  STEP 5 — SAFE ZONE BUILD + STEP 6 — safePool
   payout range: min(entryFee×2, maxPayoutCeiling-1) → entryFee
   Must be smooth linear decrease.
═══════════════════════════════════════════════════════════════════════════ */

function buildSafeZone({ winners, entryFee, maxPayoutCeiling = Infinity }) {
  const safeCount = Math.floor(winners * 0.20);

  if (safeCount < 2) {
    throw new Error(
      `[SafeZone] winners=${winners} yields safeCount=${safeCount}. ` +
      "Need at least 2 safe ranks for a smooth decrease. " +
      "Increase maxEntries or winnerPercentage."
    );
  }

  const safeStart = winners - safeCount + 1;

  const maxPrize    = Math.min(entryFee * 2, maxPayoutCeiling - 1);
  const minPrize = roundPayout(entryFee * 1.05);
  const minPrizeInt = roundPayout(minPrize);  // integer floor; always > entryFee

  // Guard: if the ceiling is at or below minPrize, flat safe zone
  if (maxPrize <= minPrize) {
    const safeSlabs = [{ rank_from: safeStart, rank_to: winners, amount: minPrizeInt }];
    const safePool  = safeCount * minPrizeInt;
    return { safeStart, safeCount, safeSlabs, safePool };
  }

  const perRank = [];
  for (let i = 0; i < safeCount; i++) {
    const t      = i / (safeCount - 1);
    const amount = Math.max(minPrizeInt, Math.floor(maxPrize - (maxPrize - minPrize) * t));
    perRank.push(amount);
  }

  // Hard monotonic non-increase guard
  for (let i = 1; i < perRank.length; i++) {
    if (perRank[i] > perRank[i - 1]) perRank[i] = perRank[i - 1];
  }

  // Collapse consecutive equal values into slabs
  const safeSlabs = [];
  let groupStart  = safeStart;
  let groupAmt    = perRank[0];

  for (let i = 1; i < perRank.length; i++) {
    const rank = safeStart + i;
    if (perRank[i] !== groupAmt) {
      safeSlabs.push({ rank_from: groupStart, rank_to: rank - 1, amount: groupAmt });
      groupStart = rank;
      groupAmt   = perRank[i];
    }
  }
  safeSlabs.push({ rank_from: groupStart, rank_to: winners, amount: groupAmt });

  const safePool = perRank.reduce((s, v) => s + v, 0);

  return { safeStart, safeCount, safeSlabs, safePool };
}


/* ═══════════════════════════════════════════════════════════════════════════
   § 4  STEP 7 — TOP-10 INDIVIDUAL RANKS  (Rule A)
   rank1 = floor(bonusPool × rank1Percentage / 100) — ONLY source
═══════════════════════════════════════════════════════════════════════════ */

function buildTop10({ bonusPool, rank1Percentage, entryFee, bonusEnd }) {
  const rank1 = Math.floor(bonusPool * rank1Percentage / 100);
  console.log("rank1Percentage:", rank1Percentage, "rankamount:", rank1);

  if (rank1 <= 0) {
    throw new Error(
      `[Top10] rank1=${rank1} is non-positive. ` +
      "Reduce rank1Percentage or increase the bonus pool."
    );
  }

  const MIN_TOP10 = Math.ceil(entryFee * 1.5);
  const DECAY     = 0.75;
  const MAX_DROP  = 0.70;

  const limit   = Math.min(10, bonusEnd);
  const amounts = [rank1];

  for (let i = 1; i < limit; i++) {
    const prev    = amounts[i - 1];
    const natural = Math.floor(prev * DECAY);
    const floor30 = Math.floor(prev * MAX_DROP);
    let   next    = Math.max(MIN_TOP10, Math.max(natural, floor30));

    if (next >= prev) next = prev - 1;
    if (next <= 0)    next = 1;

    amounts.push(next);
  }

  const top10Slabs = amounts.map((amount, i) => ({ rank: i + 1, amount }));
  return { top10Slabs, rank1 };
}


/* ═══════════════════════════════════════════════════════════════════════════
   § 4b  PRIZE TABLE — Ultra contest specification
   Ranks 1–100 are hard-coded exact targets.
   Ranks 101–1000 are linearly interpolated between anchor points.
   All values are baseline (unscaled). Caller scales by rank1Actual / BASE_RANK1.
═══════════════════════════════════════════════════════════════════════════ */

const BASE_RANK1 = 14100;

const _RAW_1_20 = [
  14100, 10920, 8740, 7230, 6080,
   5200,  4510, 3980, 3550, 3200,
   2910,  2670, 2460, 2280, 2120,
   1980,  1860, 1750, 1650, 1560,
];
const _RAW_21_50 = [
  1480, 1410, 1350, 1290, 1240,
  1190, 1150, 1110, 1070, 1040,
  1010,  980,  950,  920,  900,
   870,  850,  830,  810,  790,
   770,  750,  730,  710,  700,
   680,  660,  650,  630,  620,
];
const _RAW_51_100 = [
  600, 590, 570, 560, 550,
  540, 530, 520, 510, 500,
  490, 480, 470, 460, 450,
  440, 430, 420, 410, 400,
  390, 380, 370, 360, 350,
  340, 330, 320, 310, 300,
  290, 280, 270, 260, 250,
  245, 240, 235, 230, 225,
  220, 215, 210, 205, 200,
  195, 190, 185, 180, 175,
];
// [rank, amount] anchor points for interpolated zones
const _ANCHORS_101_200 = [
  [100, 175], [110, 150], [120, 140], [130, 130], [140, 120],
  [150, 110], [160, 100], [170,  95], [180,  90], [190,  85], [200, 80],
];
const _ANCHORS_201_500 = [
  [200, 80], [250, 65], [300, 55], [350, 48], [400, 42], [450, 38], [500, 35],
];
const _ANCHORS_501_1000 = [
  [500, 35], [600, 28], [700, 22], [800, 18], [900, 15], [1000, 13],
];

function _interpAnchors(anchors, fromRank, toRank) {
  const out = [];
  for (let r = fromRank; r <= toRank; r++) {
    let segA = anchors[0], segB = anchors[anchors.length - 1];
    for (let i = 0; i < anchors.length - 1; i++) {
      if (r >= anchors[i][0] && r <= anchors[i + 1][0]) {
        segA = anchors[i]; segB = anchors[i + 1]; break;
      }
    }
    const [rA, aA] = segA, [rB, aB] = segB;
    out.push(Math.round(aA + (aB - aA) * (r - rA) / (rB - rA)));
  }
  return out;
}

function _buildPrizeTable() {
  const t = new Array(1001).fill(0);   // index 1..1000; index 0 unused
  _RAW_1_20  .forEach((v, i) => { t[i +   1] = v; });
  _RAW_21_50 .forEach((v, i) => { t[i +  21] = v; });
  _RAW_51_100.forEach((v, i) => { t[i +  51] = v; });
  _interpAnchors(_ANCHORS_101_200,  101, 200).forEach((v, i) => { t[i + 101] = v; });
  _interpAnchors(_ANCHORS_201_500,  201, 500).forEach((v, i) => { t[i + 201] = v; });
  _interpAnchors(_ANCHORS_501_1000, 501, 1000).forEach((v, i) => { t[i + 501] = v; });
  // Enforce strict monotonic decrease across the full table
  for (let r = 2; r <= 1000; r++) {
    if (t[r] >= t[r - 1]) t[r] = t[r - 1] - 1;
    if (t[r] <= 0) t[r] = 1;
  }
  return t;
}

// Pre-computed once at module load
const PRIZE_TABLE = _buildPrizeTable();

/**
 * Build per-rank entries for ranks 1..min(1000, bonusEnd).
 * Scales PRIZE_TABLE proportionally so rank 1 == rank1Actual exactly,
 * then enforces strict monotonic decrease.
 * Accepts optional budgetCap: stops early if running sum would exceed it.
 */
function buildPremiumTop1000(
  rank1Actual,
  bonusEnd,
  budgetCap = Infinity,
  bonusPool,
  entryFee
) {
  const limit       = Math.min(1000, bonusEnd);
  const scaleFactor = rank1Actual / BASE_RANK1;
  const amounts     = [rank1Actual];
  let   runningSum  = rank1Actual;

  for (let rank = 2; rank <= limit; rank++) {
    let scaled = Math.round(PRIZE_TABLE[rank] * scaleFactor);
    const prev = amounts[rank - 2];

    if (scaled >= prev) {
      scaled = prev >= 10 ? prev - 1 : Math.round((prev - 0.1) * 10) / 10;
    }

    const floorVal = rank <= 100
      ? Math.max(entryFee * 2, scaled)
      : Math.max(roundPayout(entryFee * 1.1), scaled);
    scaled = roundPayout(Math.min(prev - (prev >= 10 ? 1 : 0.1), floorVal));

    // STOP EARLY instead of post-scaling — this prevents negative remainBudget
    if (runningSum + scaled > budgetCap) break;

    amounts.push(scaled);
    runningSum += scaled;
  }

  return amounts.map((amount, i) => ({ rank: i + 1, amount }));
}


/* ═══════════════════════════════════════════════════════════════════════════
   § 5  GROUPED MIDDLE SLABS  (Rule B)
═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
   § 5  MIDDLE SLABS — fixed-group structure (same boundaries every time)

   Ranks  11–20   : one group (10 ranks)
   Ranks  21–50   : one group (30 ranks)
   Ranks  51–100  : one group (50 ranks)
   Ranks 101–200  : one group (100 ranks)
   Ranks 201–500  : one group (300 ranks)
   Ranks 501–1000 : one group (500 ranks)
   Ranks 1001–bonusEnd : single flat amount = entryFee+1

   All amounts are strictly decreasing and > entryFee.
   Returns { slabs, rank1Residual } where rank1Residual is the tiny leftover
   (< first-group count ≈ 10) that cannot be split into grouped slabs;
   the caller adds it to rank1.
═══════════════════════════════════════════════════════════════════════════ */

const FIXED_MID_GROUPS = [
  [11,   20],
  [21,   50],
  [51,  100],
  [101, 200],
  [201, 500],
  [501, 1000],
];
const FLAT_ZONE_START = 1001;

function buildMiddleSlabs({ top10Count, bonusEnd, lastTop10Amount, entryFee, midBudget }) {
  if (top10Count >= bonusEnd || midBudget <= 0) return { slabs: [], rank1Residual: 0 };

  const refundMultiplier =
  entryFee <= 1 ? 1.001 :
  entryFee <= 2 ? 1.03 :
  1.05;

const minPrize = roundPayout(entryFee * refundMultiplier);
  const DECAY = 0.62;

  // ── Active fixed groups (clipped to bonusEnd) ────────────────────────────
  const groups = FIXED_MID_GROUPS
    .filter(([from, to]) => to > top10Count && from <= bonusEnd)
    .map(([from, to]) => {
      const gFrom = Math.max(from, top10Count + 1);
      const gTo   = Math.min(to, bonusEnd);
      return { from: gFrom, to: gTo, count: gTo - gFrom + 1, amount: 0 };
    });

  // ── Flat zone: FLAT_ZONE_START → bonusEnd, single fixed amount = refundMin ─
  const flatStart  = Math.max(FLAT_ZONE_START, top10Count + 1);
  const flatCount  = bonusEnd >= flatStart ? bonusEnd - flatStart + 1 : 0;
  const refundMin  = roundPayout(entryFee * (
    entryFee <= 1 ? 1.001 : entryFee <= 2 ? 1.03 : 1.05
  ));
  const flatAmount = refundMin;
  const flatTotal  = flatCount * flatAmount;

  // Budget available after pre-funding the flat zone at minimum
  const fixedBudget = Math.max(0, midBudget - flatTotal);

  // ── Compute decay amounts for each fixed group ───────────────────────────
  let prevAmt = lastTop10Amount;
  for (const g of groups) {
    let amt = Math.max(MIN, Math.floor(prevAmt * DECAY));
    if (amt >= prevAmt) amt = prevAmt - 1;
    if (amt < MIN)      amt = MIN;
    g.amount = amt;
    prevAmt  = amt;
  }

  const uncappedTotal = groups.reduce((s, g) => s + g.count * g.amount, 0);

  // ── Scale down proportionally when decay totals exceed fixedBudget ───────
  if (uncappedTotal > fixedBudget && groups.length > 0) {
    const ratio = fixedBudget / Math.max(1, uncappedTotal);
    prevAmt = lastTop10Amount;
    for (const g of groups) {
      const scaled = Math.max(MIN, Math.floor(g.amount * ratio));
      g.amount = prevAmt > MIN ? Math.min(prevAmt - 1, scaled) : scaled;
      prevAmt  = g.amount;
    }
  }

  // ── Push remaining fixedBudget into groups top-down ──────────────────────
  let fixedTotal = groups.reduce((s, g) => s + g.count * g.amount, 0);
  let residual   = fixedBudget - fixedTotal;

  for (let i = 0; i < groups.length && residual > 0; i++) {
    const g   = groups[i];
    const cap = (i === 0 ? lastTop10Amount : groups[i - 1].amount) - 1;
    const add = Math.min(cap - g.amount, Math.floor(residual / g.count));
    if (add > 0) {
      g.amount += add;
      residual -= add * g.count;
    }
  }
  // residual now < count(groups[0]) — caller adds it to rank1

  // ── Assemble output slabs ────────────────────────────────────────────────
  const slabs = groups.map(g => ({ rank_from: g.from, rank_to: g.to, amount: g.amount }));
  if (flatCount > 0) {
    slabs.push({ rank_from: flatStart, rank_to: bonusEnd, amount: flatAmount });
  }

  return { slabs, rank1Residual: residual };
}


/* ═══════════════════════════════════════════════════════════════════════════
   § 6  BONUS POOL RECONCILIATION
   Scales middle slabs and adjusts rank1 to hit bonusPool exactly.
   FIX v2: Called twice — once against the initial bonusPool, and if safePool
   changes after the ceiling-capped rebuild, called again with the final bonusPool.
═══════════════════════════════════════════════════════════════════════════ */

function sumSlabs(slabs) {
  return slabs.reduce((acc, s) => {
    const count = s.rank != null ? 1 : (s.rank_to - s.rank_from + 1);
    return acc + count * s.amount;
  }, 0);
}

function reconcileBonus({ top10Slabs, middleSlabs, bonusPool, entryFee }) {
  const MIN_MID    = entryFee + 1;
  let   midSlabs   = [...middleSlabs];
  let   midSum     = sumSlabs(midSlabs);
  const top10Sum   = sumSlabs(top10Slabs);
  const midBudget  = bonusPool - top10Sum;

  if (midBudget < 0) {
    // top10 alone already exceeds bonusPool — scale top10 proportionally
    const ratio     = bonusPool / top10Sum;
    const scaled    = top10Slabs.map((s, i) => ({
      ...s,
      amount: i === 0
        ? Math.max(1, Math.floor(s.amount * ratio))   // rank1 gets the floor
        : Math.max(1, Math.floor(s.amount * ratio)),
    }));
    // Enforce strict monotonic decrease after scaling
    for (let i = 1; i < scaled.length; i++) {
      if (scaled[i].amount >= scaled[i - 1].amount) {
        scaled[i] = { ...scaled[i], amount: scaled[i - 1].amount - 1 };
      }
      if (scaled[i].amount <= 0) scaled[i] = { ...scaled[i], amount: 1 };
    }
    // Residual to rank1
    const residual  = bonusPool - sumSlabs(scaled) - sumSlabs([]);
    scaled[0]       = { ...scaled[0], amount: scaled[0].amount + residual };
    if (scaled[0].amount <= 0) {
      throw new Error(
        `[Reconcile] top10 sum (${top10Sum}) far exceeds bonusPool (${bonusPool}). ` +
        "Reduce rank1Percentage or increase pool."
      );
    }
    return { top10Slabs: scaled, middleSlabs: [] };
  }

  if (midSlabs.length > 0 && midSum > midBudget) {
    const ratio   = midBudget / midSum;
    midSlabs = midSlabs.map(s => ({
      ...s,
      amount: Math.max(MIN_MID, Math.floor(s.amount * ratio)),
    }));

    // Re-enforce monotonic decrease after scaling
    let prevAmt = top10Slabs[top10Slabs.length - 1].amount;
    midSlabs = midSlabs.map(s => {
      const safe = Math.min(prevAmt - 1, Math.max(MIN_MID, s.amount));
      prevAmt    = safe;
      return { ...s, amount: safe };
    });

    midSum = sumSlabs(midSlabs);

    // Safety pass: the monotonic enforcement's Math.max(MIN_MID) can inflate amounts
    // back above midBudget. Scale once more without the MIN_MID floor to fit exactly.
    if (midSum > midBudget) {
      const ratio2 = midBudget / midSum;
      midSlabs = midSlabs.map(s => ({
        ...s,
        amount: Math.max(1, Math.floor(s.amount * ratio2)),
      }));
      midSum = sumSlabs(midSlabs);

      // Extreme edge: even at ₹1/rank it still exceeds budget — drop middle slabs.
      if (midSum > midBudget) {
        midSlabs = [];
        midSum   = 0;
      }
    }
  }

  // Rounding residual applied to rank1
  const usedBonus  = top10Sum + midSum;
  const residual   = bonusPool - usedBonus;

  const finalTop10    = [...top10Slabs];
  finalTop10[0]       = { ...finalTop10[0], amount: finalTop10[0].amount + residual };

  if (finalTop10[0].amount <= 0) {
    throw new Error(
      `[Reconcile] Residual (${residual}) adjustment made rank1 non-positive ` +
      `(rank1 was ${top10Slabs[0].amount}, bonusPool=${bonusPool}, usedBonus=${usedBonus}). ` +
      "Adjust input parameters."
    );
  }

  return { top10Slabs: finalTop10, middleSlabs: midSlabs };
}


/* ─────────────────────────────────────────────────────────────────────────
   roundPayout: no floating-point leakage in final payout amounts
   ≥ 10  →  integer     (Math.round)
   < 10  →  one decimal (Math.round to 0.1 precision)
───────────────────────────────────────────────────────────────────────── */
function roundPayout(x) {
  if (x >= 10) return Math.round(x);
  return Math.round(x * 10) / 10;
}


/* ═══════════════════════════════════════════════════════════════════════════
   § 6b  HYBRID BONUS SLAB BUILDER  (v3)
   ─────────────────────────────────────────────────────────────────────────
   Top-10  : progressive decay  rank2=×0.48, rank3=×0.74, rank4=×0.80,
             rank5=×0.84, rank6+=×0.88  — never collapsed by reconciliation
   Middle  : gradual per-group decay ×0.76 (groups 11–1000)
   Flat    : four descending bands, per-band decay ×0.82 (ranks 1001+)
   Residual: flows top-down into upper groups; rank2–10 untouched
═══════════════════════════════════════════════════════════════════════════ */

// index = (rank-1); rank6+ use the trailing 0.88
const TOP10_STEP_DECAY = [null, 0.48, 0.74, 0.80, 0.84];

const MID_GROUP_DECAYS = [
  0.55, // 11–20
  0.65, // 21–50
  0.72, // 51–100
  0.75, // 101–200
  0.78, // 201–500
  0.82  // 501–1000
];   // applied once per middle group

const FLAT_BAND_DEFS = [
  { from:  1001, to:  5000 },
  { from:  5001, to: 15000 },
  { from: 15001, to: 30000 },
  { from: 30001, to: 44000 },   // last band; extends to bonusEnd when needed
];
const FLAT_STEP_DECAY = 0.74;   // applied once per flat band — wider separation per band


function buildHybridBonusSlabs({ bonusPool, rank1Percentage, entryFee, bonusEnd }) {
  const minMultiplier =
    entryFee <= 1 ? 1.1 :
    entryFee <= 2 ? 1.10 :
    1.25;

 const MIN =
  entryFee <= 1 ? 1 :
  entryFee <= 2 ? 2 :
  roundPayout(entryFee * minMultiplier);

  /* ── rank1 locked to bonusPool × rank1Percentage ────────────────────── */
  const rank1Raw = Math.floor(bonusPool * rank1Percentage / 100);
  if (rank1Raw < MIN) {
    throw new Error(
      `[Hybrid] rank1=${rank1Raw} < MIN=${MIN}. ` +
      "Reduce rank1Percentage or increase pool."
    );
  }

  /* ── TABLE-BASED TOP-1000: exact per-rank prizes, strictly monotonic ── */
  // budgetCap = 85% of bonusPool prevents runningSum from exhausting the
  // entire pool before flat bands are allocated.
  const curveBudget =
    bonusEnd <= 1000
      ? Math.floor(bonusPool * 0.92)
      : Math.floor(bonusPool * 0.55);
  const premiumEntries = buildPremiumTop1000(
  rank1Raw,
  bonusEnd,
  curveBudget,
  bonusPool,
  entryFee
);
  const top1000Sum     = premiumEntries.reduce((s, e) => s + e.amount, 0);
  let   remainBudget   = bonusPool - top1000Sum;
  if (remainBudget < 0) remainBudget = 0;   // hard clamp — never negative

  /* ── Flat bands (1001+) — FLAT_STEP_DECAY applied per band ─────────── */
  const flatGroups = [];
  let   prevAmt    = premiumEntries[premiumEntries.length - 1].amount;

  if (bonusEnd >= 1001) {
    for (let bi = 0; bi < FLAT_BAND_DEFS.length; bi++) {
      const band   = FLAT_BAND_DEFS[bi];
      if (band.from > bonusEnd) break;
      const isLast = bi === FLAT_BAND_DEFS.length - 1;
      const aTo    = isLast ? bonusEnd : Math.min(band.to, bonusEnd);
      const count  = aTo - band.from + 1;

      let amt = Math.floor(prevAmt * FLAT_STEP_DECAY);
      const safeCap = roundPayout(prevAmt - 0.1);
    amt = Math.min(safeCap, amt);

// continuity protection
if (amt >= prevAmt) {
  amt =
    prevAmt >= 10
      ? prevAmt - 1
      : roundPayout(prevAmt - 0.1);
}

// minimum floor only if still monotonic
const dynamicMin = Math.min(MIN, safeCap);

amt = Math.max(dynamicMin, amt);

// final monotonic enforcement
if (amt >= prevAmt) {
  amt =
    prevAmt >= 10
      ? prevAmt - 1
      : roundPayout(prevAmt - 0.1);
} 
amt = roundPayout(amt);
      amt = roundPayout(amt);
      if (amt <= 0) {
  amt = entryFee <= 1 ? 1 : 0.1;
}
      flatGroups.push({ from: band.from, to: aTo, count, amount: amt });
      prevAmt = amt;
    }
  }

  let flatTotal    = flatGroups.reduce((s, g) => s + g.count * g.amount, 0);
  remainBudget    -= flatTotal;   // subtract what flat bands already consumed
if (remainBudget < 0) {
  let excess = Math.abs(remainBudget);

  // shrink flat bands first
  for (let i = flatGroups.length - 1; i >= 0; i--) {
    const g = flatGroups[i];

    const maxReducible = (g.amount - MIN) * g.count;

    if (maxReducible <= 0) continue;

    const reduce = Math.min(excess, maxReducible);

    const perRankReduce = Math.ceil(reduce / g.count);

    g.amount = roundPayout(
      Math.max(MIN, g.amount - perRankReduce)
    );

    excess -= perRankReduce * g.count;

    if (excess <= 0) break;
  }

  flatTotal = flatGroups.reduce(
    (s, g) => s + g.count * g.amount,
    0
  );

  remainBudget = bonusPool - top1000Sum - flatTotal;
}

  /* ── If combined total exceeds bonusPool, shrink flat bands bottom-up ── */
  if (remainBudget < 0) {
    for (let i = flatGroups.length - 1; i >= 0 && remainBudget < 0; i--) {
      const g          = flatGroups[i];
      const excess     = -remainBudget;
      const reduceBy   = Math.min(g.amount - MIN, Math.ceil(excess / g.count));
      if (reduceBy > 0) {
        g.amount     = Math.max(MIN, g.amount - reduceBy);
        remainBudget += reduceBy * g.count;
      }
    }
    flatTotal    = flatGroups.reduce((s, g) => s + g.count * g.amount, 0);
    remainBudget = bonusPool - top1000Sum - flatTotal;
  }

  /* ── Distribute positive residual top-down into flat bands ──────────── */
  for (let i = 0; i < flatGroups.length && remainBudget > 0; i++) {
    const prevCap  = i === 0
      ? premiumEntries[premiumEntries.length - 1].amount
      : flatGroups[i - 1].amount;
    const headroom = prevCap - 1 - flatGroups[i].amount;
    if (headroom <= 0) continue;
    const maxBoost = Math.floor(flatGroups[i].amount * 0.45);
    const perRank  = Math.min(headroom, Math.floor(remainBudget / flatGroups[i].count), Math.floor(maxBoost));
    if (perRank > 0) {
      flatGroups[i].amount += perRank;
      remainBudget         -= perRank * flatGroups[i].count;
    }
  }

  for (let i = 0; i < flatGroups.length && remainBudget > 0; i++) {
    if (remainBudget >= flatGroups[i].count) {
      flatGroups[i].amount += 1;
      remainBudget         -= flatGroups[i].count;
    }
  }

  // Sub-count residual (< smallest flat band count) → rank1
  let rank1Final = rank1Raw;

if (remainBudget > 0) {
  rank1Final += remainBudget;
}

  /* ── Assemble output — shape unchanged for caller compatibility ──────── */
  const allPremium = premiumEntries.map((s, i) => ({
    rank:   s.rank,
    amount: roundPayout(i === 0 ? rank1Final : s.amount),
  }));

  const top10Slabs  = allPremium.slice(0, Math.min(10, allPremium.length));
  const middleSlabs = allPremium.slice(10);   // ranks 11–1000, individual entries

  const flatSlabs = flatGroups.map(g => ({
    rank_from: g.from,
    rank_to:   g.to,
    amount:    roundPayout(g.amount),
  }));

  return { top10Slabs, middleSlabs, flatSlabs };
}


/* ═══════════════════════════════════════════════════════════════════════════
   § 7  INTEGRITY ASSERTIONS
═══════════════════════════════════════════════════════════════════════════ */

function assertCoverage(slabs, winners) {
  const sorted = [...slabs].sort((a, b) =>
    (a.rank ?? a.rank_from) - (b.rank ?? b.rank_from)
  );

  let cursor = 1;
  for (const s of sorted) {
    const start = s.rank ?? s.rank_from;
    const end   = s.rank ?? s.rank_to;

    if (start !== cursor) {
      throw new Error(
        `[Coverage] Gap/overlap at rank ${cursor}: next slab starts at ${start}`
      );
    }
    cursor = end + 1;
  }

  if (cursor - 1 !== winners) {
    throw new Error(
      `[Coverage] Distribution ends at rank ${cursor - 1} but total winners = ${winners}`
    );
  }
}

function assertMonotonic(slabs) {
  const sorted = [...slabs].sort((a, b) =>
    (a.rank ?? a.rank_from) - (b.rank ?? b.rank_from)
  );
  let prev = Infinity;

  for (const s of sorted) {
    if (s.amount > prev) {
      const label = s.rank != null ? `rank ${s.rank}` : `ranks ${s.rank_from}–${s.rank_to}`;
      throw new Error(`[Monotonic] Amount increases at ${label}: ${s.amount} > ${prev}`);
    }
    if (s.amount <= 0) {
      const label = s.rank != null ? `rank ${s.rank}` : `ranks ${s.rank_from}–${s.rank_to}`;
      throw new Error(`[Monotonic] Zero/negative amount at ${label}: ${s.amount}`);
    }
    prev = s.amount;
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   § 8  MAIN EXPORT
═══════════════════════════════════════════════════════════════════════════ */

/**
 * generatePrizeDistribution
 *
 * FIX v2 — single-pass approach (no estimate/actual mismatch):
 *
 *   Pass 1: Build safe zone with uncapped ceiling → get safePool₁ → bonusPool₁
 *   Pass 1: Build + reconcile bonus slabs against bonusPool₁
 *   Pass 1: Determine bonusTailAmount from reconciled slabs
 *
 *   Pass 2: Rebuild safe zone capped at (bonusTailAmount − 1) → safePool₂ → bonusPool₂
 *   Pass 2: If bonusPool₂ ≠ bonusPool₁ → re-reconcile bonus slabs against bonusPool₂
 *           (delta is now small — just ceiling rounding — so rank1 stays positive)
 *
 *   This keeps the ceiling-cap fix for monotonicity while eliminating large deltas.
 */


export function generatePrizeDistribution({
  entryFee,
  maxEntries,
  winnerPercentage,
  platformFeePercentage,
  rank1Percentage = 5,
}) {
  /* ── Coerce ─────────────────────────────────────────────────────────── */
  entryFee              = Number(entryFee);
  maxEntries            = Number(maxEntries);
  winnerPercentage      = Number(winnerPercentage);
  platformFeePercentage = Number(platformFeePercentage);
  rank1Percentage       = Number(rank1Percentage);

  /* ── Practice mode ──────────────────────────────────────────────────── */
  if (entryFee === 0) {
    return {
      prize_distribution: [],
      debug: {
        totalCollection: 0, platformFee: 0, netPool: 0,
        safePool: 0, bonusPool: 0, rank1: 0,
        winners: 0, safeStart: null, safeCount: 0, totalPayout: 0,
      },
    };
  }

  /* ── Validate ───────────────────────────────────────────────────────── */
  validateInputs({ entryFee, maxEntries, winnerPercentage, platformFeePercentage, rank1Percentage });

  /* ── Steps 1–4: Core financials ─────────────────────────────────────── */
  const { totalCollection, platformFee, netPool, winners } = calcCore({
    entryFee, maxEntries, winnerPercentage, platformFeePercentage,
  });

  const safeCountCheck = Math.floor(winners * 0.20);
  if (safeCountCheck < 2) {
    throw new Error(
      `[SafeZone] winners=${winners} yields safeCount=${safeCountCheck}. ` +
      "Need at least 2 safe ranks. Increase maxEntries or winnerPercentage."
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     PASS 1 — uncapped refund zone → derive bonusTailAmount for ceiling
  ═══════════════════════════════════════════════════════════════════ */
  const pass1Safe  = buildSafeZone({ winners, entryFee });
  const bonusPool1 = netPool - pass1Safe.safePool;

  if (bonusPool1 <= 0) {
    throw new Error(
      `[BonusPool] bonusPool=${bonusPool1} ≤ 0. ` +
      "Refund zone consumes entire net pool. Reduce winnerPercentage or platformFeePercentage."
    );
  }

  const { safeStart } = pass1Safe;
  const bonusEnd      = safeStart - 1;
  if (bonusEnd < 1) throw new Error("[Calc] No bonus ranks available.");

  const pass1Bonus = buildHybridBonusSlabs({
    bonusPool: bonusPool1, rank1Percentage, entryFee, bonusEnd,
  });

  // Determine tail of bonus zone for the ceiling cap
  const allPass1   = [...pass1Bonus.top10Slabs, ...pass1Bonus.middleSlabs, ...pass1Bonus.flatSlabs];
  const bonusTailAmt = allPass1[allPass1.length - 1].amount;

  /* ═══════════════════════════════════════════════════════════════════
     PASS 2 — rebuild refund zone capped at (bonusTailAmt − 1)
     enforces monotonicity at the bonus/refund boundary
  ═══════════════════════════════════════════════════════════════════ */
  const pass2Safe = buildSafeZone({ winners, entryFee, maxPayoutCeiling: bonusTailAmt });
  const safePool  = pass2Safe.safePool;
  const bonusPool = netPool - safePool;

  if (bonusPool <= 0) {
    throw new Error(`[BonusPool] bonusPool=${bonusPool} ≤ 0 after capped refund zone.`);
  }

  // Rebuild bonus slabs only if bonusPool changed (ceiling cap shifted safePool)
  const finalBonus = bonusPool !== bonusPool1
    ? buildHybridBonusSlabs({ bonusPool, rank1Percentage, entryFee, bonusEnd })
    : pass1Bonus;

  /* ── Assemble full distribution ─────────────────────────────────────── */
  const prize_distribution = [
    ...finalBonus.top10Slabs,
    ...finalBonus.middleSlabs,
    ...finalBonus.flatSlabs,
    ...pass2Safe.safeSlabs,
  ];

  /* ── Integrity assertions ───────────────────────────────────────────── */
  assertCoverage(prize_distribution, winners);
  assertMonotonic(prize_distribution);

  let  totalPayout = sumSlabs(prize_distribution);
  let delta = netPool - totalPayout;

  if (delta > 0) {
    // Residual goes to flat bands first; sub-count remainder falls to rank1
   const flatSlabsInDist = prize_distribution.filter(
  s =>
    s.rank_from >= 1001 &&
    s.rank_to <= bonusEnd
);
    for (let i = 0; i < flatSlabsInDist.length && delta > 0; i++) {
      const g     = flatSlabsInDist[i];
      const count = g.rank_to - g.rank_from + 1;
      const perRank = Math.floor(delta / count);
      if (perRank > 0) {
        g.amount = roundPayout(g.amount + perRank);
        delta   -= perRank * count;
      }
    }
    if (delta > 0) {
      prize_distribution[0].amount = roundPayout(prize_distribution[0].amount + delta);
    }
  }

totalPayout = sumSlabs(prize_distribution);

/* ── Monotonic cleanup ───────────────────────── */
// for (let i = 1; i < prize_distribution.length; i++) {
//   const prev = prize_distribution[i - 1];
//   const curr = prize_distribution[i];

//   if (curr.amount > prev.amount) {
//     curr.amount = prev.amount;
//   }
// }

/* ── Smooth tiny oscillations ───────────────── */
// for (let i = 1; i < prize_distribution.length; i++) {
//   const prev = prize_distribution[i - 1];
//   const curr = prize_distribution[i];

//   if (
//     prev.amount < 10 &&
//     Math.abs(prev.amount - curr.amount) <= 0.1
//   ) {
//     curr.amount = prev.amount;
//   }
// }

/* ── Recalculate after cleanup ─────────────── */
let finalDelta = netPool - totalPayout;

if (finalDelta !== 0) {
  // distribute only into premium ranks
  const premium = prize_distribution.filter(
    s => s.rank && s.rank >= 2 && s.rank <= 10
  );

  let idx = 0;

  while (finalDelta > 0) {
    premium[idx].amount += 1;
    finalDelta -= 1;
    idx = (idx + 1) % premium.length;
  }

  while (finalDelta < 0) {
    if (premium[idx].amount > entryFee * 2) {
      premium[idx].amount -= 1;
      finalDelta += 1;
    }

    idx = (idx + 1) % premium.length;
  }
}

totalPayout = sumSlabs(prize_distribution);

/* ── Final strict validation ───────────────── */
if (totalPayout !== netPool) {
  throw new Error(
    `[FinalCheck] totalPayout=${totalPayout} !== netPool=${netPool} (delta=${netPool - totalPayout})`
  );
}

  /* ── Spot-check log for key ranks ──────────────────────────────────── */
  const _spotRanks = [1, 10, 50, 100, 500, 1000, 1001, 5000];
  const _dist      = prize_distribution;
  console.log("[Prize] netPool:", netPool, "| bonusPool:", bonusPool, "| safePool:", safePool);
  console.log("[Prize] rank1 actual:", finalBonus.top10Slabs[0].amount);
  for (const r of _spotRanks) {
    const entry = _dist.find(s =>
      s.rank === r || (s.rank_from != null && s.rank_from <= r && s.rank_to >= r)
    );
    console.log(`[Prize] rank ${r}:`, entry ? entry.amount : "n/a");
  }

  return {
    prize_distribution,
    debug: {
      totalCollection,
      platformFee,
      netPool,
      safePool,
      bonusPool,
      rank1: finalBonus.top10Slabs[0].amount,
      winners,
      safeStart: pass2Safe.safeStart,
      safeCount: pass2Safe.safeCount,
      totalPayout,
    },
  };
}
