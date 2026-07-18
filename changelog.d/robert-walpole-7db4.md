---
category: Changed
bump: minor
scope: repo
---

Migrate the changelog workflow to per-PR fragment files under `changelog.d/` (kills the shared `## [Unreleased]` merge conflict): `changelog:add` writes a fragment, `changelog:preview` renders the pending release, `changelog:collect` folds fragments into CHANGELOG.md plus a machine-readable `releases/<version>.json` manifest at release-cut
