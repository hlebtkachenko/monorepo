-- Tracker migration reset (PR #603, Linear -> GitHub issues).
-- `dedup` and `snooze` are pure caches keyed to the retired Linear backend:
-- dedup.issue_id held Linear UUIDs and snooze.scope_key held `DEV-nn` identifiers.
-- The GitHub engine interprets dedup.issue_id as a GitHub issue NUMBER, so a
-- surviving Linear row would make any recurrence comment into a 404 void and
-- never open a GitHub issue for that fingerprint. Clearing both tables just
-- re-files one fresh GitHub issue per still-live fingerprint and drops stale
-- snoozes — fail-open toward MORE alerts, never fewer.
DELETE FROM dedup;
DELETE FROM snooze;
