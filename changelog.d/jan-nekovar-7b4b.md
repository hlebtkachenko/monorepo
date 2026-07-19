---
category: Changed
---

Relocated auth/onboarding shared glue (signup/invite cookies, active-workspace cookie, invite materialization, client error reporter) out of route `_lib` folders into `apps/web/lib/` so cross-tier consumers no longer reach into a route segment's private folder.
