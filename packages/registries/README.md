# @workspace/registries

Czech public-registry lookups — **ARES** (business registry, keyed on IČO) and
**CRPDPH** (Registr plátců DPH / nespolehlivý plátce, keyed on DIČ).

Pure `fetch` + Zod, **zero workspace dependencies** (no db, no accounting). The
lookups produce SUGGESTED inputs for org scaffolding / counterparty prefill; a
caller does the lookup, a human/agent confirms, and the confirmed data flows
downstream. Raw payloads never leave the package (PII); only the minimal
normalized shapes do.

## API

```ts
import { lookupAres, lookupVatRegistry } from "@workspace/registries"

const profile = await lookupAres("12345678")
// → { legalName, legalFormCode, personKind, dic, inPublicRegister,
//     registeredAt, naceCodes, address, ... }

const vat = await lookupVatRegistry("CZ12345678")
// → { found, isPayer, unreliable, unreliableSince, bankAccounts,
//     suggestedVatRegime }
```

## Boundaries / caveats

- **ARES** is REST/JSON, fair-use rate limited — debounce + cache at the caller.
  `pravniForma` is a ČSÚ číselník code mapped to `legal_form.code` via
  `csu-legal-form.ts` (approximation; unmapped → null → manual pick).
- **CRPDPH** is **SOAP** (not REST). It returns payer presence, the
  unreliability flag + date, and published bank accounts. It does **not** return
  the filing period, the registration date, or non-payer vs identified-person —
  those are user-confirmed. The live service can't be integration-tested in CI;
  `parseCrpdphResponse` is unit-tested against a recorded fixture, and the HTTP
  path needs a live smoke-test before production use.
- The pure normalizers (`normalizeAresResponse`, `parseCrpdphResponse`) are the
  load-bearing, tested logic; the `fetch` wrappers are thin.
