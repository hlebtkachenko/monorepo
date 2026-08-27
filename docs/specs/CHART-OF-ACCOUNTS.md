# Chart of Accounts (Účtový rozvrh)

How Afframe models the Czech chart of accounts: the data model, the number
format, what is stored vs derived, how a chart is born, and how the rest of the
platform consumes it. Grounded in the shipped code (file:line anchors). A final
section marks the **planned rebuild** (dash separator + new fields) that is
in-flight and not yet landed.

---

## 1. What it is

The **účtový rozvrh** is one organization's real, working list of accounts for
one accounting period. It is the spine every accounting flow resolves against:
postings, saldokonto, the general ledger, the statutory statements (rozvaha /
výsledovka), assets, and the AI/Brain booking lane all reference accounts from
here.

Two related but distinct things share the "chart" word:

| Czech                     | Model                                                                      | What                                          | Scope                      |
| ------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- | -------------------------- |
| **Účtový rozvrh**         | `account`                                                                  | the tenant's real accounts                    | per-org, **per-period**    |
| **Účetní osnova** (roční) | `directive_account_year`                                                   | the statutory year framework (synthetic-only) | shared reference, per-year |
| Směrná osnova             | `directive_account` (3-digit) + `account_group` (2-digit, Decree 500/2002) | reference spine + statement mapping           | shared reference           |
| Šablony                   | `chart_template` (+ `_account`)                                            | prebuilt starter charts                       | shared reference           |

The rozvrh is **tenant data**; the osnova / směrná osnova / šablony are **shared
law-as-reference** used to seed and classify it.

## 2. Regime gating — not every org has a chart

A chart exists **only for double-entry (podvojné účetnictví) organizations**.
The regime is fixed per entity, derived from its legal form at first-period
creation (`packages/org-provisioning/src/accounting-scaffold.ts`:
`resolveOrgAccountingProfile` → `requiresChartForRegime`). Single-entry /
tax-records orgs keep **no** chart and the chart reads return empty. So the very
first question any chart code asks is "does this org's active period have a
chart at all?"

## 3. Data model — the `account` table

`packages/db/src/schema/account.ts` (+ migration `0029_accounting_chart.sql`).
Per-organization, per-period, **FORCE RLS** on `current_setting('app.organization_id')`.

Stored columns:

| Column                                       | Meaning                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `id` (uuid, PK)                              | the account identity — **everything downstream joins on this, not on the number** |
| `organization_id`, `chart_id`, `period_id`   | tenancy + which period's chart it belongs to                                      |
| `parent_id` (uuid, null)                     | analytical → its synthetic (same chart); null = a synthetic                       |
| `number` (text)                              | the account number, e.g. `311`, `311.001` (see §4)                                |
| `name` (text)                                | display name                                                                      |
| `nature` (enum)                              | the **single source of truth** for classification (see §5)                        |
| `normal_balance` (DEBIT / CREDIT / null)     | obvyklý zůstatek; **null** where the account sign-flips (431, 481, FX)            |
| `tracks_open_items` (bool)                   | **Saldokonto** — the one stored policy flag; switches on the open-items engine    |
| `tax_relevant` (bool / null)                 | **Daňový**; null for balance/closing accounts                                     |
| `specializes_directive_code` (char(3), null) | link back to the směrná-osnova account it specializes (statement mapping)         |
| `created_at`, `updated_at`                   | timestamps (no update trigger; `updated_at` is stamped by hand)                   |

**Generated columns** (read-only projections of `number` / `parent_id`, zero drift):

| Column           | Expression                                              | Value                   |
| ---------------- | ------------------------------------------------------- | ----------------------- |
| `class`          | `left(number,1)::int`                                   | 0–9 (Třída)             |
| `group_code`     | `left(replace(number,'.',''),2)` (null for classes 8/9) | 2-digit Skupina         |
| `synthetic_code` | `left(replace(number,'.',''),3)`                        | 3-digit synthetic       |
| `is_synthetic`   | `parent_id IS NULL`                                     | synthetic vs analytical |

`account_chart_number_unique (chart_id, number)` keeps numbers unique within a
period's chart.

## 4. The number format

Today the stored `number` is a **3-digit synthetic** optionally followed by a
`.`-separated analytical suffix, enforced by a DB CHECK on `account` (and,
identically, on `asset`, `depreciation_plan` ×2, `open_item`):

```
number ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$'      e.g.  311   or   311.001
```

The number is a **display + reference key**, not the join key — postings and
balances reference the account by **UUID**. Only five columns store the number
_string_ (`account.number`, `open_item.account_number`, `asset.account_number`,
`depreciation_plan.{expense,accumulated}_account_number`), and those are matched
exactly by `resolveAccountId` (`packages/accounting/src/accounts.ts`).

> **Planned change (in-flight, §12):** move to `XXX-AAAAAA` with a `-` separator
> (3-digit synthetic + single uppercase-alnum analytic). Not yet landed.

## 5. `nature` is the single source of truth; Druh/Typ are derived

Every account carries one `nature` (pg enum `account_nature`): **ASSET,
LIABILITY, EQUITY, EXPENSE, REVENUE, CLOSING, OFF_BALANCE**. This one value
determines the statement classification the UI shows. **Nothing is stored twice.**

Derivation (`apps/web/lib/org/accounting.ts:56-90`):

| `nature`    | **Druh** — `statementClass`   | **Typ** — `accountType` |
| ----------- | ----------------------------- | ----------------------- |
| ASSET       | BALANCE_SHEET (Rozvahový)     | ACTIVE (Aktivní)        |
| LIABILITY   | BALANCE_SHEET                 | PASSIVE (Pasivní)       |
| EQUITY      | BALANCE_SHEET                 | PASSIVE                 |
| EXPENSE     | INCOME_STATEMENT (Výsledkový) | EXPENSE                 |
| REVENUE     | INCOME_STATEMENT              | REVENUE                 |
| CLOSING     | CLOSING (Závěrkový)           | — (null)                |
| OFF_BALANCE | OFF_BALANCE (Podrozvahový)    | — (null)                |

Money S3 and older systems expose **Druh účtu** (Rozvahový/Výsledkový/Závěrkový/
Podrozvahový) and **Typ účtu** (Aktivní/Pasivní) as two separate user-picked
radios. Afframe does **not** — because `nature` (7 values) is strictly more
expressive than those two radios (it separates EQUITY from LIABILITY, which the
radios cannot), and because the statutory statement builder keys on `nature`,
not on a label. Druh + Typ are therefore **pure projections** of `nature`; the
user picks `nature` once. The genuinely mixed-balance accounts (431 výsledek ve
schvalovacím řízení, 481 odložená daň, 261 peníze na cestě) are handled by
`normal_balance = NULL` plus the statement sign-split lines, not by a separate
Aktivní/Pasivní override.

## 6. The 4-tier tree

The UI projects the flat, number-sorted chart into a 4-tier forest
(`apps/web/lib/org/chart-of-accounts-tree.ts` `buildChartTree`):

| Tier                     | Source                          | Row?                        | Selectable/editable |
| ------------------------ | ------------------------------- | --------------------------- | ------------------- |
| **Třída** (0–9)          | synthesized from `class`        | no DB row — a label wrapper | no                  |
| **Skupina** (2-digit)    | synthesized from `group_code`   | no DB row — a label wrapper | no                  |
| **Syntetický** (311)     | real `account`, `is_synthetic`  | yes                         | yes                 |
| **Analytický** (311.001) | real `account`, `parent_id` set | yes                         | yes                 |

Class + Group are structural label-only nodes; Synthetic + Analytical are real,
fully-wired rows. Nesting is by `parent_id` to any depth; an analytical whose
synthetic parent is missing is promoted to a root under its own Class/Group
rather than dropped.

## 7. How a chart is born (seed)

A chart is never hand-built from nothing. `scaffoldAccountingPeriod`
(`accounting-scaffold.ts`) creates the period, and — when the regime requires a
chart — `createChart` then **seeds it**:

- **From the framework (Účetní osnova):** `seedChartFromDirectives` copies the
  statutory synthetic accounts effective for the period's year
  (`resolveFrameworkYear` falls back to the latest published prior year).
- **From a template (Šablona):** `startChartFromTemplate` forks a prebuilt
  `chart_template` into the period.

Both are surfaced on an **empty period's** chart page as the two toolbar seed
actions ("Založit z osnovy" / "Použít šablonu"). The framework/templates are
synthetic-only; analytics are added by the accountant afterward.

## 8. What the rest of the platform reads from the chart

The chart is the spine; consumers resolve against it by **UUID** (per-period) or
by **number** (stable across periods — the "perennial by number" references):

| Consumer                                                | Needs                                               | via                                |
| ------------------------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| Double-entry posting line                               | `account_id`                                        | UUID FK                            |
| Saldokonto (open items)                                 | `account_number` + `tracks_open_items`              | number + flag                      |
| Journal / General ledger / Trial balance                | id, number, name, nature, normal_balance            | read                               |
| Rozvaha / Výsledovka                                    | number, nature, `specializes_directive_code`, group | `zaverka.ts` (keys on `nature`)    |
| §16 reconcile Σ(analytical)=synthetic                   | `synthetic_code`                                    | read-time rollup (`invariants.ts`) |
| Assets / depreciation / accruals / close                | `account_number`                                    | number                             |
| Public API `/v1/accounts` · MCP `list_accounts` (Brain) | all / lookup                                        | read                               |

Statement placement is driven by `specializes_directive_code →
balance_sheet_line / income_statement_line`, with the legally-guaranteed
`account_group` fallback and the sign-split columns
(`balance_sheet_line_when_debit / _when_credit`) — **not** by any Druh/Typ label.

## 9. The UI surface (`/o/[orgSlug]/accounting/chart-of-accounts`)

A **tree-table** archetype over the period's chart: Class → Group → Synthetic →
Analytical, with search, per-column facets, expand/collapse, CSV export. The
period switcher drives which period's chart is shown.

- **View / Edit** happens in the **row inspector** (open a synthetic/analytical
  row). Editable fields are **name**, **Saldokonto** (`tracks_open_items`),
  **Daňový** (`tax_relevant`) — číslo, Druh, Typ, normal side are read-only
  (derived / immutable). Editing persists at each field's commit boundary
  (blur / Enter / select) via `updateChartAccount`.
- **Reference subpage** — Účetní osnova (`chart-framework`) is the read-only
  statutory framework for the period's year.

## 10. Write operations (the only two)

Both are org-scoped (`withOrganization`, FORCE RLS + explicit `organization_id`
predicate) in `apps/web/lib/org/accounting.ts`, wrapping the domain writes in
`packages/accounting/src/setup.ts`:

- **`addChartAccount(org, ws, user, {periodId, number, name, nature,
normalBalance?, tracksOpenItems?, taxRelevant?, parentId?,
specializesDirectiveCode?})`** — adds one account (requires an existing chart).
- **`updateChartAccount(org, ws, user, {id, name?, tracksOpenItems?,
taxRelevant?})`** — updates only the user-editable fields; `number`, `nature`
  and the derived dimensions are immutable. The SET list is built from the
  present keys (not `COALESCE`), so `taxRelevant: null` genuinely clears the flag.

Both are **human-gated** accounting writes.

## 11. What is stored vs derived vs reference (summary)

- **Stored on `account`:** number, name, nature, normal_balance,
  tracks_open_items, tax_relevant, parent_id, specializes_directive_code.
- **Derived (never stored):** class, group_code, synthetic_code, is_synthetic
  (generated columns); statementClass (Druh) + accountType (Typ) (from `nature`).
- **Reference (shared, not tenant data):** směrná osnova (`directive_account` +
  `account_group`), roční osnova (`directive_account_year`), templates
  (`chart_template`).

---

## 12. Planned rebuild (in-flight — NOT yet landed)

Tracked in `.context/plans/chart-of-accounts-redo.md` (two-advisor reviewed).
Pre-launch, so migrations are forward-fix. Summary of the agreed design:

- **Separator `.` → `-`, format `XXX-AAAAAA`.** New CHECK regex
  `^[0-9]{3}(-[0-9A-Z]{N,6})?$` on the 5 number-string columns; 3-digit synthetic
  fixed; uppercase-only single-level analytic. Generated columns are left as-is
  (the dash sits after position 3, so `left(replace(number,'.',''),3)` still
  yields the synthetic). The ledger is UUID-joined, so posting / závěrka / §16
  reconcile are untouched; the change is a validator + backfill.
- **`note` (poznámka)** — the one new **stored** column (editable, searchable).
- **Oprávkový / Vnitropodnikový** — **derived**, not stored (from
  `account_group.is_valuation_adjustment` and `class IN (8,9)`).
- **currency / year-restriction / technický** — pending a product decision;
  each only ships in its genuinely-useful form (currency = booking-default +
  mismatch warning, out of the books; year = a `do_not_carry_forward` flag;
  technický = a flag paired with a close-readiness "clearing nets to zero" check)
  — never as a dead column.
- **Druh / Typ stay derived** (see §5). Possible small improvement: a `MIXED`
  `accountType` value when `normal_balance IS NULL`, so 431/481-family accounts
  display honestly.
- **Add-account form** rebuilt on the `inspector-sheet` block: an InputGroup
  pairing a grouped, type-to-find synthetic **Combobox** (ComboboxGroup by
  Class/Group, autoHighlight) with the analytic input, plus name, nature, and
  Saldokonto/Daňový as checkboxes.

---

_Sources: `packages/db/src/schema/account.ts`, migrations `0025`–`0035`/`0067`,
`packages/accounting/src/{setup,accounts,chart-of-accounts,period,invariants,
output/zaverka}.ts`, `apps/web/lib/org/{accounting,chart-of-accounts-tree}.ts`,
`packages/org-provisioning/src/accounting-scaffold.ts`._
