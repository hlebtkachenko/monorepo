---
category: Fixed
---

Stop CI's `web-integration` and `coverage` jobs from silently testing the wrong packages: `turbo --affected` discards `--filter`, so both jobs re-ran whatever `unit-test` was already running instead of their own scope.
