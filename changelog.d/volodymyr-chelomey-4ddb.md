---
category: Fixed
---

Login now preserves a benign deep-link query (e.g. the Inspector `?inspect=<uuid>`) through the sign-in redirect instead of dropping it; credential-bearing keys (token, code, state, secret, …) are scrubbed first so they never round-trip as `?next=` or reach a logger.
