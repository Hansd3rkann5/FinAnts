-- Persisted EnableBanking session. PSD2 only requires SCA (TAN) for the
-- initial consent — the session it produces stays valid for months, so
-- storing it lets later syncs pull transactions without re-authorizing.
-- Single-user app → single row (id = 1).
CREATE TABLE IF NOT EXISTS eb_session (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  session_id  TEXT NOT NULL,
  accounts    TEXT NOT NULL,  -- JSON: EbAccountResource[] from the code exchange
  valid_until TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
