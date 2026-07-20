---
category: Added
bump: minor
---

`reopenPeriod` — privileged storno-based reversal of a year-end close (colvání the účetní závěrka): stornos the 701 carryover, the 702 balance-close, and the 710 result-close (append-only, never deletes), reopens the period, reconciles both periods, and logs to an append-only `period_reopen_log`. Guards: only the latest-closed period, and refuses once the result is distributed.
