# @workspace/accounting (v2)

Domain layer for the Czech Accounting Records System, rewritten against the **v2 English schema**
(migrations `0024-0036`). Implements capture, posting (with předkontace expansion + a VAT engine),
an FX engine, read-model-backed books, period lifecycle, corrections, supporting postings,
saldokonto, invariant checks, and period output for the three Czech bookkeeping regimes
(podvojné §13 → `DOUBLE_ENTRY`, jednoduché §13b → `SINGLE_ENTRY`, daňová evidence §7b ZDP →
`TAX_RECORDS`).

All operations run through `@workspace/db`'s `withOrganization` helper (organization-scoped,
FORCE RLS). The org **is** the účetní jednotka (no separate unit table). Money is exact decimal in
SQL; the TypeScript layer transports amounts as the `Decimal = string` alias and does **zero**
arithmetic in JS (R13) — every sum, balance, and FX difference is computed in SQL.

The read-model (`account_period_balance` / `monetary_period_summary`) is maintained by DB triggers
in the same transaction as each posting; the books read those tables, they are **not** recomputed
views (READ-MODEL-DESIGN).

---

## Public API

Import from the package root:

```ts
import {
  createEvent,
  captureDocument,
  postFromPredkontace,
  generateOutput,
} from "@workspace/accounting"
```

`ctx` is `OrgCtx = { organizationId, workspaceId }`. Every write must run inside a
`withOrganization` transaction so the deferred R4 balance trigger and the read-model maintenance
fire at COMMIT.

### Setup (master data)

```ts
createPeriod(db, ctx, input)          // účetní období (regime + accounting currency)
createNumberSeries(db, ctx, input)    // číselná řada (EVENT / DOCUMENT / ASSET / INVENTORY_COUNT)
createChart(db, ctx, input)           // účtový rozvrh (per period)
createAccount(db, ctx, input)         // účet (structural levels GENERATED from `number`)
createCounterparty(db, ctx, input)    // protistrana (workspace-shared)
createCategory(db, ctx, input)        // peněžní-deník kategorie
createAsset / createDepreciationPlan / createInventoryCount / recordSignature
```

### Capture — UC-1 steps 1-3

```ts
createEvent(db, ctx, EventInput)      // účetní případ (§6/1); allocates a gapless Označení
captureDocument(db, ctx, DocumentInput) // summary_record + individual_record + partial_record
```

`captureDocument` freezes each partial's accounting-currency amounts (single currency: = source;
foreign: base × fx_rate, VAT base × vat_fx_rate).

### Posting — UC-1 step 4

```ts
post(db, ctx, PostInput)                    // dispatches by the period's regime
postDoubleEntry(db, ctx, DoubleEntryInput)  // DOUBLE_ENTRY: posting_double_entry_line rows
postMonetary(db, ctx, MonetaryInput)        // SINGLE_ENTRY / TAX_RECORDS: posting_monetary_line rows
postFromPredkontace(db, ctx, input)         // expand a partial_record via a předkontace scenario
```

### Předkontace (account-coding templates)

`SALES_SCENARIOS` / `PURCHASE_SCENARIOS` — curated, law-cited templates transcribed from the KB
(`30-predkontace`). `expandPartialRecord` turns one `partial_record` into balanced MD/Dal lines,
resolving each entry's amount basis (`net` / `vat` / `gross` / `self_assessed_vat`) **in SQL** and
each account NUMBER to the period's account_id (D8). Reverse-charge / import self-assess VAT at
posting (`self_assessed_vat` = base × rate) — the koeficient is injected at posting, never stored.

### FX engine

```ts
postFxSettlement(db, ctx, input)   // cross-currency settlement → realized 563/663 (ČÚS 006)
revalueOpenItemFx(db, ctx, input)  // §4/12 balance-sheet-day revaluation → 563/663
periodFxPolicy(db, periodId)       // the §24 DAILY / FIXED rate policy
```

### Saldokonto

```ts
openItem(db, ctx, input)                 // open a pohledávka / závazek
settleOpenItem(db, ctx, input)           // record a párování (settled_amount is trigger-maintained)
openItemsForCounterparty / unsettledOpenItems / saldoPerPartner
```

### Books — UC-2 (read-model consumers)

```ts
journal(db, periodId)          // deník (line-scan, incl. 701 opening postings)
generalLedger(db, periodId)    // hlavní kniha / obratová předvaha (PS | obraty | KS)
monetaryJournal / monetarySummary
```

### Period lifecycle

```ts
closePeriod(db, periodId)               // §17; R12 trigger blocks new postings after
openNextPeriod(db, ctx, input)          // new period + chart copy-forward + 701 opening balances
```

### Corrections / supporting / invariants / output

```ts
reverse(db, ctx, input)                       // úplné storno (negated lines; R8)
generateDepreciation / recordInventoryDifference
unpostedCases / reconcileAnalytics / reconcileReadModel / traceAccount / traceEvent
generateOutput(db, ctx, input)                // R6-gated; závěrka / přehledy / DPFO
```

---

## Money representation

SQL columns: `numeric(19,4)` — exact, no float. TypeScript: `Decimal = string` (pass `"121.00"`,
never `121.00` or `121n`). All sums, balances, and FX differences are computed in SQL. The repo's
`Money<Currency>` brand (ADR-0013) is compile-time only and is not used here.

## Running tests

```
pnpm --filter @workspace/accounting test
```

Boots a Postgres 18 testcontainer (`@workspace/testcontainers`), applies migrations `0001-0036`,
and exercises capture → post → book → output across all three regimes plus FX settlement,
corrections, period carry-forward, saldokonto, the VAT engine, and the R-invariants.
