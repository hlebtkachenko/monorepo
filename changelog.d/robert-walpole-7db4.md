---
category: Changed
bump: minor
---

Migrate the changelog workflow to per-PR fragment files under `changelog.d/`, replacing the shared `## [Unreleased]` block that conflicted on every second parallel merge: `changelog:add` writes a uniquely-named fragment, `changelog:preview` renders the pending release with the suggested version bump, and `changelog:collect` folds all fragments into a new `CHANGELOG.md` version section (backfilling each `(#PR)` from git) at release-cut
