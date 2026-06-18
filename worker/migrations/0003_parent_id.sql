-- Links an itemized credit-card purchase to the lump-sum Giro "Kreditkarte"
-- booking it was billed under, so the purchase can be hidden from the main
-- list/charts (it only exists to be found via its parent) while the parent's
-- chart contribution is replaced by the children's category breakdown.
ALTER TABLE transactions ADD COLUMN parent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tx_parent ON transactions(parent_id);
