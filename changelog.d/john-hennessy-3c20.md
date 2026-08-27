---
category: Changed
---

Gave the beta rate limiters an explicit `resetRateLimitersForTests()` so suites that spend a process-wide budget no longer make their own test order load-bearing.
