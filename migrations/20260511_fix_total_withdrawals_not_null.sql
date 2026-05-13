-- Fix total_withdrawals column: enforce NOT NULL DEFAULT 0.00
-- and backfill any existing NULL values.

-- Step 1: Null out-of-date rows first (safe no-op if none exist)
UPDATE wallets SET total_withdrawals = 0.00 WHERE total_withdrawals IS NULL;

-- Step 2: Backfill historical approved withdrawals that were never counted
--   (approvals processed before the wallet-update code was deployed)
UPDATE wallets w
INNER JOIN (
  SELECT user_id, SUM(amount) AS total_approved
  FROM withdraws
  WHERE status = 'APPROVED'
  GROUP BY user_id
) agg ON agg.user_id = w.user_id
SET w.total_withdrawals = agg.total_approved
WHERE w.total_withdrawals = 0.00;

-- Step 3: Tighten the column constraint
ALTER TABLE wallets
  MODIFY COLUMN total_withdrawals DECIMAL(15,2) NOT NULL DEFAULT 0.00;
