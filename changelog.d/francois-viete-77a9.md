---
category: Security
---

Beta: a request that reaches the auth route without a usable client IP is now rate limited on a shared per-path bucket instead of skipping Better Auth's limiter entirely, and the one-time-link screens get their own GET budget.
