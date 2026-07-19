---
category: Changed
---

Relocated the org accounting reads + session/period glue (`accounting-data`, `request-session`, `header-periods`) out of `[orgSlug]/_lib` into `apps/web/lib/org`, so cross-tier consumers (saldokonto vouchers view) no longer import the org route tree (orgSlug Track A).
