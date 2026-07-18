---
category: Fixed
---

Make the admin utility-page catalog test assertion deterministic: query the feedback UI synchronously (getBy) after the state settles instead of three default-1s findBy polls, closing the last CI-contention flake vector (test-only)
