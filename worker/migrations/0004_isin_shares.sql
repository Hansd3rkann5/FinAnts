-- Per-trade ISIN + signed share count (positive = bought, negative = sold),
-- extracted from Trade Republic trade events — used to reconstruct holdings
-- over time for the depot performance chart. Null for every non-trade row.
ALTER TABLE transactions ADD COLUMN isin TEXT;
ALTER TABLE transactions ADD COLUMN shares REAL;
CREATE INDEX IF NOT EXISTS idx_tx_isin ON transactions(isin);
