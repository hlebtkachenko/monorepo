---
category: Fixed
---

Kontrolní hlášení A.2: split the supplier's VAT id into k_stat + vatid_dod. The prefixed form both mismatched VIES and overran maxLength="12" on NL/SE/LT/XI ids, failing XSD validation for the whole hlášení.
