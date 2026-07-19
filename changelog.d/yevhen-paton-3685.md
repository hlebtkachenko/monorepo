---
category: Changed
---

CI: drop the `^build` dependency from turbo `test`/`test:coverage` tasks — workspace packages export source (`./src/index.ts`), so tests never import built dist and the dependency-compile step was pure waste on every test job.
