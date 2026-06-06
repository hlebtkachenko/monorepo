-- afframe-bot state (Cloudflare D1). Re-scopes DEV-55's pending-approval store off
-- AWS RDS (unreachable from a Worker) to Worker-local D1.

-- Auto-issue dedup: one row per fingerprint -> the Linear issue it maps to.
CREATE TABLE IF NOT EXISTS dedup (
  fingerprint TEXT PRIMARY KEY,
  issue_id    TEXT NOT NULL,
  identifier  TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 1,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL
);

-- Agent human-in-the-loop approvals (DEV-55). decision NULL = pending; first tap wins.
CREATE TABLE IF NOT EXISTS approval (
  id        TEXT PRIMARY KEY,
  decision  TEXT,
  options   TEXT NOT NULL,   -- JSON array of option labels
  summary   TEXT,
  exp       INTEGER NOT NULL,
  created   INTEGER NOT NULL
);

-- Dead-man's-switch heartbeats (DEV-62): last time a named job checked in.
CREATE TABLE IF NOT EXISTS heartbeat (
  job_key   TEXT PRIMARY KEY,
  last_run  INTEGER NOT NULL
);

-- Snooze / ack state for alerts (DEV-63).
CREATE TABLE IF NOT EXISTS snooze (
  scope_key TEXT PRIMARY KEY,
  until     INTEGER NOT NULL,
  acked     INTEGER NOT NULL DEFAULT 0
);
