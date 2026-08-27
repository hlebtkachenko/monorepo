---
category: Added
bump: minor
---

Added an office-side revocation for a mis-bound beta employee seat: `revokeEmployeeSeat` clears `payroll_employee.app_user_id` and deactivates the guest membership in one transaction, so remediating a wrong binding cannot leave the wrong human in the book as a plain guest.
