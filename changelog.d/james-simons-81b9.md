---
category: Fixed
---

Souhrnné hlášení VAT ids split correctly: Greece files under EL rather than its ISO code GR, ids that merely start with two letters are no longer truncated, and rows that normalize to the same DIČ and kód plnění are merged as the schema requires.
