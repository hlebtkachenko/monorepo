---
category: Added
---

Added `withdrawMisassignedPayslip` — the first caller of `softDeleteDocument`, which had been the remediation mechanism for a payslip filed against the wrong person while having no caller at all. It refuses a non-payslip, so the payroll door cannot reach an invoice.
