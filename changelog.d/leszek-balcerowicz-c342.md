---
category: Added
---

Brain `book`: wire ISDOC 6.0.1 e-invoices into the capture-plan pipeline (`parseIsdoc` IsdocInvoice→Brain-IR adapter) — source-verbatim VAT, reverse-charge/credit-note/foreign-currency handling, foreign counterparties resolved by DIČ + country (never a fabricated Czech IČO), org-relative direction via `--context` `subject`; fail-closed on ambiguity (#792)
