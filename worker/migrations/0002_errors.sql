CREATE TABLE IF NOT EXISTS errors (
  id          TEXT PRIMARY KEY,
  time        TEXT NOT NULL,
  context     TEXT NOT NULL,
  message     TEXT NOT NULL,
  stack       TEXT,
  device      TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_errors_time ON errors(time);
