---
category: Fixed
---

Beta: the Úvěry and Pro účetní money/decimal inputs now accept Czech-written amounts (`150 000,50`, `650 000,00`, `1.234,56`) instead of answering "Neplatný vstup." — the same grouping-and-decimal-comma boundary bug fixed in Majetek (#1060), now shared via one `normalizeBetaMoneyInput` helper.
