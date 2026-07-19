---
category: Added
---

Localize chart-of-accounts reference names through the existing next-intl catalogs: the Účetní osnova (`accounting.chartOfAccounts.osnovaNames.*`) and prebuilt-template (`accounting.chartOfAccounts.templateNames.*`) account names are generated into `messages/{en,cs}.json` from the vendored seed and the reference migration, and the app edge resolves them by code with `getTranslations` like every other string — no bespoke catalog, no per-language DB column.
