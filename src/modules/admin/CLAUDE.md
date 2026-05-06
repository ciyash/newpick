# Prize Distribution Engine — Project Context

## What This Project Does
Financial-grade fantasy contest prize distribution engine.
Generates monotonically decreasing payout slabs for ranked winners,
split into bonus zone (top ranks) and safe/refund zone (bottom 20% of winners).

## Key Files
- `generatePrizeDistribution.js` — main export and all logic
- Entry point: `generatePrizeDistribution({ entryFee, maxEntries, winnerPercentage, platformFeePercentage, rank1Percentage })`

## Strict Calculation Order (DO NOT CHANGE)
1. totalCollection = maxEntries × entryFee
2. platformFee     = floor(totalCollection × platformFeePercentage / 100)
3. netPool         = totalCollection − platformFee
4. winners         = floor(maxEntries × winnerPercentage / 100)
5. safeCount       = floor(winners × 0.2)  →  bottom 20% get refund-level payouts
6. bonusPool       = netPool − safePool
7. rank1           = floor(bonusPool × rank1Percentage / 100)

## Architecture: Two-Pass Design
- Pass 1: Build safe zone uncapped → derive bonusTailAmount
- Pass 2: Rebuild safe zone capped at (bonusTailAmount − 1) for monotonicity
- If bonusPool changed between passes → rebuild bonus slabs exactly

## Critical Invariants (enforced by assertMonotonic + assertCoverage)
- All payout amounts must be STRICTLY NON-INCREASING by rank
- Every rank from 1 → winners must be covered with no gaps
- totalPayout must equal netPool exactly (to the coin)
- rank1 must always be > 0

## Known Bug Pattern — NEVER Regress
- `buildPremiumTop1000` must accept a `budgetCap` param and stop early
  when running sum would exceed it, to prevent remainBudget going negative
- A negative remainBudget flows into rank1Final = rank1Raw + residual → rank1 < 0
- Fix: pass `curveBudget = bonusPool * 0.85` as budgetCap to buildPremiumTop1000

## Zone Breakdown
- Ranks 1–10       : individual top10Slabs (premium decay curve)
- Ranks 11–1000    : middleSlabs (per-rank premium curve entries)
- Ranks 1001+      : flatSlabs (4 flat bands with step decay × 0.74)
- Safe zone        : bottom 20% of winners, smooth linear decrease entryFee×2 → entryFee×1.05

## MIN Payout Rules
- entryFee ≤ 1  →  MIN = entryFee × 1.1
- entryFee ≤ 2  →  MIN = entryFee × 1.10
- entryFee > 2  →  MIN = entryFee × 1.25

## roundPayout Convention
- amount ≥ 10  →  Math.round (integer)
- amount < 10  →  Math.round(x * 10) / 10  (one decimal)

## Do Not Touch
- `assertCoverage` and `assertMonotonic` — these are integrity guards, not suggestions
- The two-pass safe zone rebuild — it exists to prevent monotonic violations at zone boundary
- `sumSlabs` helper — used everywhere for exact pool accounting

## Commands
- No build step needed; pure JS module (ESM export)
- Test manually: import generatePrizeDistribution and call with sample params
- Suggested test params: { entryFee: 10, maxEntries: 1000, winnerPercentage: 20, platformFeePercentage: 15, rank1Percentage: 5 }