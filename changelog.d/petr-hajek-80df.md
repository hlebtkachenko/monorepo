---
category: Security
---

Closed a re-binding gap in the beta seat revocation: unbinding `payroll_employee.app_user_id` left any unconsumed setup token pre-bound to that employee live, and the atomic claim it consumes (`app_user_id IS NULL OR = me`) succeeds against the row the unbind had just cleared — so a revoked seat could hand the next wrong human a working key. `revokeEmployeeSeat` now revokes those invites in the same transaction.
