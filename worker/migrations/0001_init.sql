-- Canonical transaction store. Primary key is a deterministic dedup hash
-- (see worker/src/db.ts deriveKey) so re-importing the same CSV / re-pulling
-- the same bank window only adds the delta.
CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY,   -- sha256 dedup key
  date          TEXT NOT NULL,      -- ISO yyyy-mm-dd
  amount        REAL NOT NULL,
  type          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  counterparty  TEXT NOT NULL DEFAULT '',
  iban          TEXT,               -- counterparty iban
  account_iban  TEXT,
  reference     TEXT,
  category_id   TEXT,               -- null until the user overrides it
  custom_label  TEXT,
  custom_icon   TEXT,
  source        TEXT,               -- 'csv' | 'eb' | 'fints'
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_iban);
