---
category: Changed
---

beta: corrected a stale comment in the app_user-writes fence test — the DELETE FROM app_user innocent case is outside the INSERT/UPDATE/MERGE pattern's scope, not a read, and migration 0021's FK now refuses that delete anyway.
