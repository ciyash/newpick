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

  const maxPrize = Math.min(entryFee * 2, maxPayoutCeiling - 1);
  const minPrize = entryFee;

  // Guard: if the ceiling is at or below minPrize, flat safe zone
  if (maxPrize <= minPrize) {
    const safeSlabs = [{ rank_from: safeStart, rank_to: winners, amount: minPrize }];
    const safePool  = safeCount * minPrize;
    return { safeStart, safeCount, safeSlabs, safePool };
  }

  const perRank = [];
  for (let i = 0; i < safeCount; i++) {
    const t      = i / (safeCount - 1);
    const amount = Math.max(minPrize, Math.floor(maxPrize - (maxPrize - minPrize) * t));
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

  const MIN   = entryFee + 1;
  const DECAY = 0.62;

  // ── Active fixed groups (clipped to bonusEnd) ────────────────────────────
  const groups = FIXED_MID_GROUPS
    .filter(([from, to]) => to > top10Count && from <= bonusEnd)
    .map(([from, to]) => {
      const gFrom = Math.max(from, top10Count + 1);
      const gTo   = Math.min(to, bonusEnd);
      return { from: gFrom, to: gTo, count: gTo - gFrom + 1, amount: 0 };
    });

  // ── Flat zone: FLAT_ZONE_START → bonusEnd, single fixed amount = MIN ─────
  const flatStart  = Math.max(FLAT_ZONE_START, top10Count + 1);
  const flatCount  = bonusEnd >= flatStart ? bonusEnd - flatStart + 1 : 0;
  const flatAmount = MIN;
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
function generatePrizeDistributionLegacy({
  entryFee,
  maxEntries,
  winnerPercentage,
  platformFeePercentage,
  rank1Percentage,
}) {

  /* ── Validate ─────────────────────────────────────────────────────────── */
  validateInputs({ entryFee, maxEntries, winnerPercentage, platformFeePercentage, rank1Percentage });

  /* ── Steps 1–4 ────────────────────────────────────────────────────────── */
  const { totalCollection, platformFee, netPool, winners } = calcCore({
    entryFee, maxEntries, winnerPercentage, platformFeePercentage,
  });

  console.debug("[Debug] Step1 totalCollection :", totalCollection);
  console.debug("[Debug] Step2 platformFee     :", platformFee);
  console.debug("[Debug] Step3 netPool         :", netPool);
  console.debug("[Debug] Step4 winners         :", winners);

  /* ── Verify safe zone is feasible ────────────────────────────────────── */
  const safeCountCheck = Math.floor(winners * 0.20);
  if (safeCountCheck < 2) {
    throw new Error(
      `[SafeZone] winners=${winners} yields safeCount=${safeCountCheck}. ` +
      "Need at least 2 safe ranks for a smooth decrease. " +
      "Increase maxEntries or winnerPercentage."
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PASS 1 — Build everything with uncapped safe zone ceiling
     Goal: get a valid bonusPool and reconciled bonus slabs
  ═══════════════════════════════════════════════════════════════════════ */

  // Safe zone (uncapped — no bonusTail known yet)
  const pass1Safe = buildSafeZone({ winners, entryFee });
  const { safeStart, safeCount } = pass1Safe;
  const bonusPool1 = netPool - pass1Safe.safePool;

  if (bonusPool1 <= 0) {
    throw new Error(
      `[BonusPool] bonusPool=${bonusPool1} after uncapped safe zone. ` +
      "Safe zone consumes the entire net pool. Reduce winnerPercentage or platformFeePercentage."
    );
  }

  console.debug("[Debug] Pass1 safePool        :", pass1Safe.safePool);
  console.debug("[Debug] Pass1 bonusPool       :", bonusPool1);

  // Build top10 + middle against bonusPool1
  const bonusEnd = safeStart - 1;
  const { top10Slabs: top10P1 } = buildTop10({
    bonusPool: bonusPool1, rank1Percentage, entryFee, bonusEnd,
  });

  const top10Count      = top10P1.length;
  const lastTop10Amount = top10P1[top10Count - 1].amount;
  const midBudget1      = bonusPool1 - sumSlabs(top10P1);
  const { slabs: midR1, rank1Residual: res1 } = buildMiddleSlabs({
    top10Count, bonusEnd, lastTop10Amount, entryFee, midBudget: midBudget1,
  });
  // Apply tiny residual (<10) to rank1 so totalPayout stays exact
  const top10R1 = res1 > 0
    ? [{ ...top10P1[0], amount: top10P1[0].amount + res1 }, ...top10P1.slice(1)]
    : top10P1;

  console.debug("[Debug] Pass1 rank1           :", top10R1[0].amount);

  /* ═══════════════════════════════════════════════════════════════════════
     PASS 2 — Rebuild safe zone capped at bonusTailAmount − 1
     Goal: enforce monotonicity at the bonus/safe boundary
  ═══════════════════════════════════════════════════════════════════════ */

  const bonusTailAmount = midR1.length > 0
    ? midR1[midR1.length - 1].amount
    : top10R1[top10R1.length - 1].amount;

  console.debug("[Debug] bonusTailAmount       :", bonusTailAmount);

  const pass2Safe = buildSafeZone({ winners, entryFee, maxPayoutCeiling: bonusTailAmount });
  const safePool  = pass2Safe.safePool;
  const bonusPool = netPool - safePool;

  console.debug("[Debug] Pass2 safePool        :", safePool);
  console.debug("[Debug] Pass2 bonusPool       :", bonusPool);

  if (bonusPool <= 0) {
    throw new Error(
      `[BonusPool] bonusPool=${bonusPool} after capped safe zone. ` +
      "Safe zone consumes the entire net pool. Reduce winnerPercentage or platformFeePercentage."
    );
  }

  /* ── If bonusPool changed, re-reconcile bonus slabs ─────────────────── */
  //
  // KEY FIX: Instead of applying a raw delta to rank1 (which can be large-negative),
  // we call reconcileBonus again with the actual bonusPool.
  // The delta between bonusPool1 and bonusPool is at most a few coins (ceiling rounding),
  // so rank1 remains positive and valid.
  //
  let finalTop10, finalMiddle;

  if (bonusPool !== bonusPool1) {
    console.debug("[Debug] bonusPool changed, rebuilding with exact budget…");
    const { top10Slabs: top10P2 } = buildTop10({
      bonusPool, rank1Percentage, entryFee, bonusEnd,
    });

    const lastTop10P2 = top10P2[top10P2.length - 1].amount;
    const midBudget2  = bonusPool - sumSlabs(top10P2);

    const { slabs: finalMiddle2, rank1Residual: res2 } = buildMiddleSlabs({
      top10Count: top10P2.length,
      bonusEnd,
      lastTop10Amount: lastTop10P2,
      entryFee,
      midBudget: midBudget2,
    });
    finalMiddle = finalMiddle2;
    finalTop10  = res2 > 0
      ? [{ ...top10P2[0], amount: top10P2[0].amount + res2 }, ...top10P2.slice(1)]
      : top10P2;
  } else {
    finalTop10  = top10R1;
    finalMiddle = midR1;
  }

  console.debug("[Debug] rank1 final           :", finalTop10[0].amount);

  /* ── Assemble full distribution ──────────────────────────────────────── */
  const prize_distribution = [
    ...finalTop10,
    ...finalMiddle,
    ...pass2Safe.safeSlabs,
  ];

  /* ── Integrity assertions ────────────────────────────────────────────── */
  assertCoverage(prize_distribution, winners);
  assertMonotonic(prize_distribution);

  const totalPayout = sumSlabs(prize_distribution);
  if (totalPayout !== netPool) {
    throw new Error(
      `[FinalCheck] totalPayout=${totalPayout} !== netPool=${netPool} (delta=${netPool - totalPayout})`
    );
  }

  console.debug("[Debug] totalPayout           :", totalPayout, "✓ matches netPool exactly");

  /* ── Return ──────────────────────────────────────────────────────────── */
  return {
    prize_distribution,
    debug: {
      totalCollection,
      platformFee,
      netPool,
      safePool,
      bonusPool,
      rank1: finalTop10[0].amount,
      winners,
      safeStart: pass2Safe.safeStart,
      safeCount: pass2Safe.safeCount,
      totalPayout,
    },
  };
}

export function generatePrizeDistribution({
  entryFee,
  maxEntries,
  winnerPercentage,
  platformFeePercentage,
  rank1Percentage = 5,
}) {
  entryFee             = Number(entryFee);
  maxEntries           = Number(maxEntries);
  winnerPercentage     = Number(winnerPercentage);
  platformFeePercentage = Number(platformFeePercentage);
  rank1Percentage      = Number(rank1Percentage);

  /* ── Practise mode ───────────────────────────────────────────────────── */
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

  /* ── Validate ────────────────────────────────────────────────────────── */
  if (!Number.isFinite(entryFee) || entryFee <= 0)
    throw new Error(`[Validation] entryFee must be positive finite — got ${entryFee}`);
  if (!Number.isInteger(maxEntries) || maxEntries < 2)
    throw new Error(`[Validation] maxEntries must be integer >= 2 — got ${maxEntries}`);
  if (!Number.isFinite(platformFeePercentage) || platformFeePercentage < 0 || platformFeePercentage >= 100)
    throw new Error(`[Validation] platformFeePercentage must be [0,100) — got ${platformFeePercentage}`);
  if (!Number.isFinite(rank1Percentage) || rank1Percentage <= 0 || rank1Percentage > 10)
    throw new Error(`[Validation] rank1Percentage must be (0,10] — got ${rank1Percentage}`);

  /* ── Steps 1–3: Core financials ──────────────────────────────────────── */
  const totalCollection = maxEntries * entryFee;
  const platformFee     = Math.floor(totalCollection * platformFeePercentage / 100);
  const netPool         = totalCollection - platformFee;
  const wpct            = (Number.isFinite(winnerPercentage) && winnerPercentage > 0) ? winnerPercentage : 55;
  const winners         = Math.floor(maxEntries * wpct / 100);

  if (winners < 2) throw new Error(`[Calc] winners=${winners} — need >= 2`);

  /* ── Step 4: Refund zone (fixed, pre-computed) ───────────────────────── */
  const safeCount   = Math.floor(winners * 0.20);
  const safeStart   = winners - safeCount + 1;           // first refund rank
  const epsilon     = Math.max(0.1, entryFee * 0.1);    // ε
  const refundAmt   = entryFee + epsilon / 2;            // fixed per-rank payout
  const refundTotal = refundAmt * safeCount;

  /* ── Step 5: Bonus pool & rank 1 ─────────────────────────────────────── */
  const bonusPool = netPool - refundTotal;
  if (bonusPool <= 0) throw new Error(`[Calc] bonusPool=${bonusPool} ≤ 0; pool too small`);

  const bonusEnd = safeStart - 1;   // last non-refund rank
  if (bonusEnd < 1) throw new Error("[Calc] no bonus ranks available");

  const rank1 = Math.floor(bonusPool * rank1Percentage / 100);
  if (rank1 < entryFee + 1) throw new Error(`[Calc] rank1=${rank1} < entryFee+1`);

  /* ── Step 6: Power curve for ranks 2..top1End ────────────────────────── */
  const indCount = Math.min(10, bonusEnd);
  const top1End  = Math.min(bonusEnd, Math.max(indCount, Math.floor(winners * 0.01)));

  // Normalise K so Σ P(r) for r=2..top1End ≈ 0.40×bonusPool − rank1
  const curveTarget = Math.max(0, bonusPool * 0.40 - rank1);
  let K = 0;
  if (top1End >= 2) {
    let wSum = 0;
    for (let r = 2; r <= top1End; r++) wSum += 1 / Math.pow(r, 0.30);
    if (wSum > 0) K = curveTarget / wSum;
  }

  // Per-rank amounts for top-1% (individually tracked for exact enforcement)
  const rankAmt = [0, rank1];   // index = rank; rankAmt[1] = rank1
  let prev = rank1;
  for (let r = 2; r <= top1End; r++) {
    let a = K > 0 ? Math.floor(K / Math.pow(r, 0.30)) : Math.floor(prev * 0.85);
    a = Math.max(entryFee + 1, a);
    if (a >= prev) a = prev - 1;
    if (a < entryFee + 1) a = entryFee + 1;
    rankAmt.push(a);
    prev = a;
  }
  const lastTop1Amt = rankAmt[rankAmt.length - 1];

  /* ── Step 7: Build top-1% zone group slabs (those within top1End) ───── */
  const GROUP_DEFS = [[11,20],[21,50],[51,100],[101,200],[201,500],[501,1000]];
  const slabs = [];   // { from, to, count, amount }

  // Individual ranks 1–min(10, bonusEnd)
  for (let r = 1; r <= indCount; r++) {
    slabs.push({ from: r, to: r, count: 1, amount: rankAmt[r] ?? (entryFee + 1) });
  }

  // Fixed groups that start within top1% (use curve amount at group start)
  let lastEnd = indCount;
  for (const [gFrom, gTo] of GROUP_DEFS) {
    if (gFrom > bonusEnd || gFrom > top1End) break;
    const aFrom = Math.max(gFrom, lastEnd + 1);
    const aTo   = Math.min(gTo, bonusEnd);
    if (aFrom > aTo) continue;
    const a = rankAmt[Math.min(aFrom, rankAmt.length - 1)] ?? (entryFee + 1);
    slabs.push({ from: aFrom, to: aTo, count: aTo - aFrom + 1, amount: a });
    lastEnd = aTo;
  }

  /* ── Step 8: Linear zone — flat uniform amount ───────────────────────── */
  // Every group beyond top1End gets the same amount = linearBudget / totalLinearCount.
  // This is the only approach that simultaneously satisfies:
  //   – non-increasing order (equal is valid for groups)
  //   – last bonus slab > refundAmt
  //   – bonus zone total = bonusPool exactly

  const top1Total = slabs.reduce((s, sl) => s + sl.count * sl.amount, 0);
  const linearBudget = bonusPool - top1Total;
  const linearStart  = Math.max(top1End + 1, lastEnd + 1);

  // Collect linear zone group ranges
  const linGroups = [];
  let linLastEnd = lastEnd;

  for (const [gFrom, gTo] of GROUP_DEFS) {
    const aFrom = Math.max(gFrom, linearStart, linLastEnd + 1);
    const aTo   = Math.min(gTo, bonusEnd);
    if (aFrom > bonusEnd || aFrom > aTo) continue;
    linGroups.push({ from: aFrom, to: aTo, count: aTo - aFrom + 1 });
    linLastEnd = aTo;
  }
  // Flat zone: 1001 → bonusEnd (single group)
  {
    const fFrom = Math.max(1001, linearStart, linLastEnd + 1);
    if (fFrom <= bonusEnd) {
      linGroups.push({ from: fFrom, to: bonusEnd, count: bonusEnd - fFrom + 1 });
      linLastEnd = bonusEnd;
    }
  }
  // Handle case where top1End >= bonusEnd (no linear zone at all)
  if (linLastEnd < bonusEnd && linearStart <= bonusEnd) {
    const fFrom = Math.max(linearStart, linLastEnd + 1);
    if (fFrom <= bonusEnd)
      linGroups.push({ from: fFrom, to: bonusEnd, count: bonusEnd - fFrom + 1 });
  }

  const totalLinearCount = linGroups.reduce((s, g) => s + g.count, 0);

  if (totalLinearCount > 0) {
    const targetUniform = linearBudget / totalLinearCount;
    if (targetUniform <= refundAmt) {
      throw new Error(
        `[Calc] Pool too small: linear-zone uniform=${targetUniform.toFixed(4)} ≤ refundAmt=${refundAmt}. ` +
        `Increase pool size or reduce winners.`
      );
    }
    // Optionally cap at lastTop1Amt to preserve monotonicity with top1 zone
    const lastTop1SlabAmt = slabs.length > 0 ? slabs[slabs.length - 1].amount : Infinity;
    const uniformAmt = Math.min(targetUniform, lastTop1SlabAmt);
    // If capping changed budget, distribute difference to rank1
    const linTotal = uniformAmt * totalLinearCount;
    for (const g of linGroups) slabs.push({ ...g, amount: uniformAmt });
    if (Math.abs(linTotal - linearBudget) > 0.001) {
      slabs[0] = { ...slabs[0], amount: slabs[0].amount + (linearBudget - linTotal) };
    }
  } else if (Math.abs(linearBudget) > 0.001) {
    // No linear zone; leftover goes to rank1
    slabs[0] = { ...slabs[0], amount: slabs[0].amount + linearBudget };
  }

  /* ── Step 11: Append refund slab ─────────────────────────────────────── */
  // Last bonus slab must be > refundAmt (strictly)
  const lastBonusAmt = slabs[slabs.length - 1].amount;
  if (lastBonusAmt <= refundAmt) {
    throw new Error(
      `[Refund] last bonus slab amount=${lastBonusAmt} ≤ refundAmt=${refundAmt}. ` +
      `Increase pool or reduce rank1Percentage.`
    );
  }

  slabs.push({ from: safeStart, to: winners, count: safeCount, amount: refundAmt });

  /* ── Step 12: Final assertions ───────────────────────────────────────── */
  const totalPayout = slabs.reduce((s, sl) => s + sl.count * sl.amount, 0);
  if (Math.abs(totalPayout - netPool) > 0.01) {
    throw new Error(`[FinalCheck] totalPayout=${totalPayout} !== netPool=${netPool}`);
  }

  for (let i = 1; i < slabs.length; i++) {
    const gap = slabs[i - 1].from <= 10 && slabs[i - 1].from === slabs[i - 1].to ? 1 : 0;
    if (slabs[i].amount + gap > slabs[i - 1].amount) {
      throw new Error(
        `[Order] slab ${slabs[i].from}–${slabs[i].to} amount=${slabs[i].amount} ` +
        `violates order vs prev=${slabs[i - 1].amount}`
      );
    }
    if (slabs[i].from < safeStart && slabs[i].amount <= entryFee) {
      throw new Error(`[Order] bonus slab rank ${slabs[i].from} amount=${slabs[i].amount} ≤ entryFee`);
    }
  }
  if (slabs[slabs.length - 1].amount <= entryFee) {
    throw new Error(`[Refund] refundAmt=${refundAmt} ≤ entryFee=${entryFee}`);
  }

  /* ── Format output ───────────────────────────────────────────────────── */
  const prize_distribution = slabs
    .filter(s => s.count > 0)
    .map(s =>
      s.from === s.to && s.from <= 10
        ? { rank: s.from, amount: s.amount }
        : { rank_from: s.from, rank_to: s.to, amount: s.amount }
    );

  return {
    prize_distribution,
    debug: {
      totalCollection,
      platformFee,
      netPool,
      safePool: refundTotal,
      bonusPool,
      rank1: slabs[0].amount,
      winners,
      safeStart,
      safeCount,
      totalPayout,
    },
  };
}
