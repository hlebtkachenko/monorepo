-- Control-plane state (PR-2). Pending write-command dispatches awaiting a confirm tap.
-- A dispatch is claimed atomically (status pending -> fired) so a double-tap can't
-- double-fire the underlying GitHub workflow_dispatch.
CREATE TABLE IF NOT EXISTS dispatch (
  token    TEXT PRIMARY KEY,   -- short opaque id embedded in the confirm callback
  kind     TEXT NOT NULL,      -- command name (deploy | rollback | deploy-bot | dast)
  payload  TEXT NOT NULL,      -- JSON: { workflow, ref, inputs, label }
  status   TEXT NOT NULL DEFAULT 'pending', -- pending | fired | cancelled | expired
  exp      INTEGER NOT NULL,
  created  INTEGER NOT NULL
);
