---
category: Changed
---

Made the shared `OrgShell` nav-agnostic — the rail/bottom-nav/per-module sidebar trees are passed in as props via a new tree-local `OrgNavShell` client wrapper instead of imported from `[orgSlug]/_nav`, so the cross-tier shell no longer reaches into the org route tree (orgSlug Track A).
