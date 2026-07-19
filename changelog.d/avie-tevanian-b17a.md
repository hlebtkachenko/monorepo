---
category: Changed
---

Moved the pure `czechToday()` date helper out of `apps/web/lib` into `@workspace/shared/date` so every tier consumes it from the shared package instead of a web-app-local path.
