-- ISIN → Yahoo Finance ticker resolution cache. Resolutions basically never
-- change, so a permanent read-through table beats re-hitting Yahoo's search
-- endpoint on every depot-history request.
CREATE TABLE IF NOT EXISTS instruments (
  isin        TEXT PRIMARY KEY,
  symbol      TEXT NOT NULL,
  name        TEXT NOT NULL,
  resolved_at TEXT NOT NULL
);
