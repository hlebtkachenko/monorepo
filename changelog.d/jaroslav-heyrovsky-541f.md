---
category: Fixed
bump: minor
---

The `/vykazy` rozvaha now follows the current příloha č. 1 of vyhláška č. 500/2002 Sb. instead of the pre-2018 form: A.IV. carries the two merged položky, both časové-rozlišení layouts of § 3 odst. 3 a 4 are available, and the řádek numbers shift accordingly (aktiva 001–081, pasiva 001–068, stored documents migrated). The zkrácený rozsah now distinguishes the malá and mikro variants of § 3a odst. 2, the výkaz zisku a ztráty renders its own zkrácený subset instead of an empty table, and ř. 56 Čistý obrat can be overridden per § 35.

The rozvaha also ties in celých tisících: the deník mapper allocates the rounding per side (largest remainder) instead of rounding each cell on its own, so a book that balances to the haléř no longer prints AKTIVA one tisíc above PASIVA, and A.V. reports the same figure as VZZ ř. 55.
