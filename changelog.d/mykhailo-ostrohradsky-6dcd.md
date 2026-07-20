---
category: Changed
---

Split the period-open path: `openPeriod` creates the period and copies the chart forward without posting the 701, and `closePeriod` posts the 701 exactly once during carryover via the exported `postOpeningBalances` primitive. Removed the redundant `openNextPeriod` open+701 entry point.
