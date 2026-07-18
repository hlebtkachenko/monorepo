---
category: Fixed
---

Deflake the admin utility-page catalog test by warming the lazy feedback chunk in a setup hook (test-only), so its render-time dynamic import no longer stalls under CI contention
