---
category: Changed
---

Moved the pure closing helpers out of the `[orgSlug]/closing/_lib/closing-shared.ts` route file: `formatIsoDate`/`monthGroupLabel` to `@workspace/shared/date` and the obligation status/grouping helpers to `@workspace/accounting/obligations`, so the workspace tier no longer imports the org route tree (orgSlug Track A).
