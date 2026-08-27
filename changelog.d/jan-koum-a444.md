---
category: Changed
---

Scope CI's web-integration job to apps/web + packages/** paths and coverage to packages/ui changes, dropping turbo --affected from both since it silently discarded --filter and made web-integration a duplicate of unit-test.
