---
category: Changed
---

Relocated the held-write approval action (`resolveHeldWrite`/`markConfidentWrong`) out of `[orgSlug]/accounting/approvals` into `apps/web/app/_components/held-writes`, co-located with its only consumers, so the held-writes UI no longer imports the org route tree (orgSlug Track A).
