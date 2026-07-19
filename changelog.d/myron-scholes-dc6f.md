---
category: Added
---

Added a `/o` nav-drift guard (`scripts/check-org-new-nav.ts`, wired as the `org-new-nav-drift` pre-push hook) that fails when an `orgHref` link targets a nonexistent page (dead link) or a page.tsx is reachable from no nav entry or link (orphan) — so unrequested pages and dead links like the removed settings stub can't silently reappear in the rebuilt org tree.
