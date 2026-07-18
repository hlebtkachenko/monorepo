---
category: Added
bump: minor
---

changelog:collect now accepts --through <ref> to cut a partial release: only fragments whose adding commit is an ancestor of the boundary are folded in and deleted, leaving later-merged fragments pending.
