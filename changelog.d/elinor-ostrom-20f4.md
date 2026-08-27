---
category: Fixed
---

Úvěry and Majetek create/update forms now refuse a stated Zůstatek or Oprávky figure with no as-of date via a named Czech field error instead of crashing on the database CHECK constraint, and wrap the write in a guarded() fallback so any other CHECK violation also surfaces as a Czech sentence.
