---
category: Changed
---

Made `apps/web/app/_components/module-page.tsx` the canonical `ModulePage` and turned the `[orgSlug]` copy into a re-export shim, so the workspace tier no longer imports the org route tree for it (orgSlug Track A).
