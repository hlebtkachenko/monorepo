---
category: Changed
---

Relocated the old cookie-based `setActivePeriodAction` out of `[orgSlug]/_lib/period-actions` into `apps/web/lib/org/period-actions-legacy.ts` (distinct name from the new `/o` tree's `period-actions`), so `period-switcher` + `company-card` no longer import the org route tree (orgSlug Track A).
