---
category: Fixed
---

IR→capture adapter: thread the DUZP/DPPD (`taxPointDate`, §21) from the IR into invoice captures so the VAT-return period resolves, instead of dropping it. A malformed date (a datetime, or an impossible day) is omitted rather than forwarded, so it can never 400 the capture after the accounting event was already created (orphaning it)
