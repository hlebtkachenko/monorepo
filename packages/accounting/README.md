# @workspace/accounting

Domain layer for the Czech Accounting Records System. Implements capture, posting, books, period
lifecycle, corrections, supporting postings, invariant checks, and period output for three Czech
bookkeeping regimes (podvojné §13, jednoduché §13b, daňová evidence §7b ZDP).

All operations run through `@workspace/db`'s `withOrganization` helper (organization-scoped,
FORCE RLS). Money is exact decimal in SQL; the TypeScript layer transports amounts as the
`Decimal = string` alias and does zero arithmetic in JS (R13, ADR-0025).

Full reference: [docs/specs/accounting-records-system.md](../../docs/specs/accounting-records-system.md)  
Decision record: [docs/adr/0025-accounting-records-system.md](../../docs/adr/0025-accounting-records-system.md)

---

## Public API

Import everything from the package root:

```ts
import {
  createCase,
  captureDocument,
  post,
  generateOutput,
} from "@workspace/accounting"
```

### Setup

```ts
createUnit(db, input) // create ucetni_jednotka (accounting unit)
createPeriod(db, input) // create ucetni_obdobi (accounting period)
createChart(db, input) // create uctovy_rozvrh (chart of accounts)
createAccount(db, input) // create ucet (account)
createCounterparty(db, input) // create protistrana stub
createCategory(db, input) // create kategorie (peněžní-deník category)
createAsset(db, input) // create majetek stub
createDepreciationPlan(db, input) // create odpisovy_plan
createInventory(db, input) // create inventurni_soupis
recordSignature(db, input) // record podpis (§33a/4)
```

### Capture — UC-1 steps 1-3 (all regimes)

```ts
createCase(db, ctx, CaseInput) // ucetni_pripad (the economic fact, §6/1)
captureDocument(db, ctx, DocumentInput) // ucetni_doklad + doklad_radek + dilci_zaznam
```

`ctx` is `UnitCtx = { organizationId, jednotkaId }`. Both functions must run inside a
`withOrganization` transaction.

### Posting — UC-1 step 4

```ts
post(db, ctx, PostInput) // dispatches by regime
postDoubleEntry(db, ctx, DoubleEntryInput) // PODVOJNE: inserts zapis_radek rows
postCashEntry(db, ctx, CashEntryInput) // JEDNODUCHE/DANOVA_EVIDENCE: inserts penezni_denik_radek rows
getUnitRegime(db, jednotkaId) // read the declared regime
```

`post` reads the unit's regime and validates the caller chose the matching posting shape. Run
inside the same `withOrganization` transaction as capture so the R4 deferred balance trigger
fires at COMMIT.

**Usage snippet (PODVOJNE — FP receipt, goods 100 + VAT 21):**

```ts
import { withOrganization } from "@workspace/db"
import { createCase, captureDocument, post } from "@workspace/accounting"

await withOrganization(orgId, userId, async (db) => {
  const ctx = { organizationId: orgId, jednotkaId }

  const pripadId = await createCase(db, ctx, {
    popis: "Nákup zboží od dodavatele",
    datumUskutecneni: "2026-03-01",
  })

  const doc = await captureDocument(db, ctx, {
    obdobiId,
    typ: "FP",
    oznaceni: "FP-2026-001",
    lines: [
      {
        pripadId,
        castka: "121.00",
        dilci: [
          { druh: "zaklad", castka: "100.00" },
          {
            druh: "dph",
            castka: "21.00",
            dphSazba: "21.00",
            dphCastka: "21.00",
          },
        ],
      },
    ],
  })

  // MD 504 Zboží / MD 343 DPH / D 321 Závazky
  await post(db, ctx, {
    kind: "double",
    entry: {
      obdobiId,
      dokladId: doc.dokladId,
      pripadId,
      datum: "2026-03-01",
      odpovednaOsoba: userId,
      lines: [
        {
          ucetId: ucet504,
          strana: "MD",
          castka: "100.00",
          dilciId: doc.lines[0]!.dilciIds[0]!,
        },
        {
          ucetId: ucet343,
          strana: "MD",
          castka: "21.00",
          dilciId: doc.lines[0]!.dilciIds[1]!,
        },
        { ucetId: ucet321, strana: "D", castka: "121.00" },
      ],
    },
  })
})
```

### Books — UC-2

```ts
denik(db) // v_denik: PODVOJNE postings chronologically
hlavniKniha(db) // v_hlavni_kniha: PODVOJNE balances by account
knihaAnalytickych(db) // v_kniha_analytickych_uctu: analytical accounts
knihaPodrozvahovych(db) // v_kniha_podrozvahovych_uctu: off-balance accounts
penezniDenik(db) // v_penezni_denik: JEDNODUCHE/DANOVA_EVIDENCE cash-book rows
```

All views enforce FORCE RLS via `security_invoker`; each call sees only the current
organization's rows.

### Period lifecycle

```ts
closePeriod(db, obdobiId) // sets stav = 'uzavreno'; R12 trigger blocks new postings
openNextPeriod(db, ctx, input) // creates new period; posts opening balances against 701
```

Opening balances (`openNextPeriod`) are generated for PODVOJNE only: for each balance-sheet
account (typ A/P, excluding třída 7) with a nonzero closing balance, one balanced posting is
created against account 701. All arithmetic is in SQL.

### Corrections

```ts
stornoEntry(db, ctx, StornoInput) // full reversal: new ucetni_zapis with negated lines
```

Storno posts into an OPEN period (R8, R12). The original posting is unchanged and remains in the
ledger. A doplňkový correction is a normal `post` call with `opravujeZapisId` + `opravaTyp` set.

### Supporting postings — UC-4

```ts
generateDepreciation(db, ctx, DepreciationInput) // MD expense / D accumulated-depreciation
recordInventoryDifference(db, ctx, InventoryDifferenceInput) // manko/přebytek adjustment
```

Both produce PODVOJNE double-entry postings and stamp the `odpisovyPlanId` / `inventuraId` FK on
the `ucetni_zapis` header for the audit trail.

### Invariants

```ts
unpostedCases(db, obdobiId) // R6: list cases with unposted dilci_zaznam
reconcileAnalytics(db) // R5: analytical vs synthetic account reconciliation
traceAccount(db, ucetId) // R11 forward: account → posting → doklad → pripad
tracePripad(db, pripadId) // R11 reverse: pripad → all postings
```

### Output — UC-3

```ts
generateOutput(db, ctx, obdobiId) // R6-gated; regime-selects the builder; records vystup row
buildZaverka(db, obdobiId) // PODVOJNE: rozvaha + výsledovka figures
buildPrehledy(db, obdobiId) // JEDNODUCHE: příjmy/výdaje totals
buildDpfo(db, obdobiId) // DANOVA_EVIDENCE: taxable income/expense and základ daně
```

`generateOutput` throws `UnpostedPeriodError` (with the list of unposted cases) when R6 is not
satisfied. `buildZaverka / buildPrehledy / buildDpfo` can be called directly for a preview
without recording a `vystup` marker.

---

## Money representation

SQL columns: `numeric(19,4)` — exact, no float.

TypeScript: `Decimal = string`. Pass `"121.00"`, not `121.00` or `121n`. The string passes
straight through to the SQL parameter; the driver does not parse it as a JS number. All sums,
balances, and output figures are computed in SQL via `SUM(castka) FILTER (...)`. Zero JS
arithmetic.

The repo's `Money<Currency>` brand (ADR-0013) is compile-time only and is not used in this
package.

---

## Running tests

```
pnpm --filter @workspace/accounting test
```

Tests boot a Postgres 18 testcontainer via `@workspace/testcontainers`, apply all migrations
including 0024–0028, and exercise the full UC-1..UC-4 flow plus corrections and invariant
checks. Test timeout is 60 s per test; container start timeout is 120 s.

```
pnpm --filter @workspace/accounting test:watch
```

---

## Running the demo

```
pnpm --filter @workspace/accounting demo
```

Requires the local compose Postgres (`app_dev`) to be running. Defaults to
`postgres://app_user:dev_user@127.0.0.1:6432/app_dev`. Records a transaction for each of the
three regimes, then prints the books and period output to stdout. Re-runnable — each run seeds
a fresh workspace.

Override the DB:

```
DATABASE_URL=postgres://... DATABASE_DIRECT_URL=postgres://... pnpm --filter @workspace/accounting demo
```
