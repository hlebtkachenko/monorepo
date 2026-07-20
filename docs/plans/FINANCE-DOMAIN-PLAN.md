# Finance domain — plan for the new `o/[orgSlug]` tree

> **Status:** REVIEWED — Advisor (Opus, xhigh) verdict READY-WITH-FIXES + an independent refutation
> pass (14/16 claims held; 2 corrected); all fixes applied and re-verified against the source. Fresh
> design for the NEW tree. Archetype decision recorded: overview + reconciliation use the existing
> **Table / Details archetype + inspector** — no new archetype or variant (Hleb, 2026-07-20).
> **Rules honored:** build ONLY in `apps/web/app/o/[orgSlug]/`; old `[orgSlug]/**` + `SITEMAP.md` +
> old CONTENT-ARCHETYPES examples are frozen and NOT used [helper: `docs/runbooks/PAGE-BUILD-START-HERE.md`].
> Task: "determine what should exist" — a fresh design, not a copy of any current IA.
> **Citations:** inline `file:line` are the load-bearing anchors (verified directly). `[B§n]` / `[A##]`
> tags point at the workspace research trail (`.context/finance-redo/`) kept for provenance.
> **Status update 2026-07-20:** REVIEWED → **IN EXECUTION.** Phase 0 shipped; the securities/investment
> tier was re-scoped by a follow-up Advisor pass. The dated **§0** immediately below is the authoritative
> current state + roadmap and supersedes the securities framing in §7/§12/§13 where they differ.

---

## 0. Execution status + roadmap (2026-07-20)

**Phase 0 Foundation — DONE (shipped):**

- `fx_rate` (shared ČNB reference) + `fx_rate_override` (org) store, the resolver
  (`resolveFxRate`/`convertAmount`/`effectiveRate`/`convertAmountAt`, money math in SQL), and the **ČNB daily
  ingest** (`cnb-fx-daily` pg-boss lane, tz-pinned 14:40 Europe/Prague; RAW rate+množství storage) — **PR #903 (merged)**.
- `financial_account` (bank / cash / ceniny) schema + `accountBalance(db,{accountNumber,periodId})` read
  primitive — **PR #901**.
- Deferred with cause (Advisor): `view_bank_detail` capability (no guard consumer until the bank UI, Phase 2)
  and a `no-direct-fx-lookup` ESLint rule (a turbo cache-buster; its own PR once Phase-2 consumers multiply).

**Phase 1 Reference — 3 of 4 pages SHIPPED (2026-07-20):**

- **Měny** (currencies) — `org_currency` enablement table (migration 0078, org-scoped FORCE RLS, **enablement-only**:
  the functional currency stays on `accounting_period.accounting_currency`, never here) + `listCurrencies` (catalog
  LEFT JOIN org_currency + functional subquery) + enable/disable server action — **PR #916 (merged)**.
- **Kurzy** (FX rates) — read-only Table over the shared `fx_rate` store + `listFxRates` (raw kurz + množství verbatim)
  — **PR #917 (merged)**. ČNB-import + manual override **DEFERRED**: `apps/web` has no worker-enqueue seam (no
  `@workspace/workers` dep / `handleCnbFxDaily` unexported / no pg-boss producer). Plan: extract `importCnbRates` into
  `@workspace/accounting` (web action + the live `cnb-fx-daily` worker share it), gate finance-member+ and audit.
- **Formy úhrady** (payment methods) — `payment_method` shared **Case-B** vocabulary (migration 0079, `cash|transfer|card|other`
  from the intake IR, i18n names keyed by code) + `listPaymentMethods` — **PR #919 (merged)**.
- **Peněžní ústavy** (financial_institution) — **NOT built.** Blocked on an authoritative **ČNB bank-code list** (the
  country register used a Hleb-provided ČSÚ dataset; there is no bank equivalent, and I will not fabricate one). Options:
  (a) provide the list → gen the seed; (b) fetch+vendor from cnb.cz (+ its update-check / prettierignore / gitleaks
  governance); (c) defer to **Phase 2** (the Advisor's original home — `financial_account.bank_code` is plain text, no
  consumer yet).
- **Build decisions (verified in-repo):** flat `financeNav` with the `ciselniky` grouping in the route
  (`finance/ciselniky/{meny,kurzy,formy-uhrady}`), mirroring the just-merged **Directory** module — **not** a grouped
  sidebar (deviates from the Advisor's grouped-now on the strength of the fresher sibling precedent). Finance reads live
  in `@workspace/accounting` (Phase-0 precedent, no `@workspace/finance` split). Reference-name i18n = generated next-intl
  message-map keyed by code. All three pages are the existing **Table** archetype (no new chrome).

**Finanční majetek / cenné papíry — decision (Advisor 2026-07-20; resolves §12 open item #5):**

- **ONE `security_holding` table** covers BOTH tradeable securities (25x) and equity participations
  (061/062/063), mirroring `financial_account`'s `kind`-discriminator + `financing_facility`'s pattern.
  Discriminators: `classification` SHORT_TERM|LONG_TERM · `instrument_kind`
  EQUITY_PARTICIPATION|EQUITY_TRADEABLE|DEBT_SECURITY|TREASURY_OWN · `control_class` (061/062/063 by stake) ·
  `valuation_model` COST|FAIR_VALUE_PL|FAIR_VALUE_EQUITY|AMORTIZED_COST (stored — a per-holding policy). GL link
  1:1 like `financial_account`; `carrying_value` event-sourced. Sub-tables `security_transaction` +
  `security_revaluation`.
- **Why one table, not two:** the equity / ekvivalence method is **consolidation-only** (§65); in the
  individual (standalone) books this product produces, a participation 061/062/063 is carried at **cost less
  impairment (096/579)** — structurally the same register as a tradeable security, just a different
  `valuation_model`. Documented split-trigger: promote participations to their own table ONLY if a
  consolidation tier is ever built.
- **Phase 6 upgraded from a dead `Blank` stub to a real minimal register** (Table+Details): acquisition,
  disposal (561/661), dividend income (665), interest income (662), manual impairment (579/096/291); COST
  model + a manual fair-value field. Built **on demand** (first client that actually holds securities/
  participations), not speculatively.
- **Deferred to Phase 7:** the automatic year-end fair-value / impairment **revaluation engine**
  (251/253 → 564/664; 257 → 414; 065/256 amortized cost) — co-located with the FX rozvahový-den revaluation
  (ČÚS 006 + ČÚS 008 share the same balance-sheet-date trigger). Equity method + consolidation: out of scope.
- **IA — NO "Finanční majetek" nav grouping** (it is a rozvaha-presentation taxonomy, which contradicts the
  real-world-object thesis §1). One leaf **"Cenné papíry a podíly"** (Table→Details, faceted by
  `instrument_kind`). The cross-object "all financial assets in one place" total lives in the Phase-7
  **Overview** (existing Table/Details archetype — no new chrome).

**Next tasks — what each PR lands (critical path, ≤800-line PRs, built only in `o/[orgSlug]`):**

| #   | Phase / task                           | What it lands                                                                                                                                                                                                                                          |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —   | ČNB backfill wiring                    | enqueue `cnb-fx-daily {date}` for the last N business days so the store has history, not forward-only                                                                                                                                                  |
| —   | Wire resolver into a first consumer    | capture stamps `effectiveRate` onto `partial_record.fx_rate`, or a CZK-equivalent display — the resolver's first real reader                                                                                                                           |
| 1   | **Reference data** _(3/4 merged — §0)_ | ✅ Měny (`org_currency` 0078, #916) · ✅ Kurzy (`fx_rate` read-only, #917) · ✅ Formy úhrady (`payment_method` 0079, #919) · ⬜ Peněžní ústavy (`financial_institution` — blocked on ČNB bank-code source; §0) · ⬜ Kurzy ČNB-import (worker seam; §0) |
| 2   | **Bank + Cash**                        | `financial_account` writes + `/v1` + `lib/org` reads; Bankovní / Pokladní účty (Table+Details); create form + opening balance; migration detect→draft; `view_bank_detail` capability + its guard land here                                             |
| 3   | **Reconciliation**                     | `statement_import`/`statement_line` + CAMT/MT940/ABO parsers; line matching (reuse `open_item_settlement`); `money_transfer` + Peníze na cestě (Table + inspector confirm-match)                                                                       |
| 4   | **Relationships**                      | `employee_balance` / `shareholder_balance` views (over saldokonto + read-model) + pages + counterparty tabs                                                                                                                                            |
| 5   | **Facilities**                         | `financing_facility` + drawdown / repayment / schedule; `reclass_mode` engine (§5.1); Financování page                                                                                                                                                 |
| 6   | **Cenné papíry a podíly**              | `security_holding` + `security_transaction` register (Table+Details); acquisition/disposal/dividend/interest/manual-impairment postings — **on demand**                                                                                                |
| 7   | **Overview + period-end revaluation**  | overview (Table/Details composition, the cross-object roll-up) + a period-end action running FX **and** securities fair-value / impairment remeasurement                                                                                               |

**Resolved (Hleb 2026-07-20):** securities build **on demand** (spec now, build Phase 6 when a real client
actually holds securities/participations — do NOT pre-build); the **one `security_holding` table** decision +
its documented split-trigger (split only if a consolidation tier is ever built) are **confirmed**.

**Still open (carried from §12):** ceniny kind-vs-sub-ledger; persist const/spec symbol; Financování
one-page-vs-four. Accounting-advisor bucket: 067-vs-069, 249 fit, 471→361, 479 attribution, 063 cost-vs-FV
default, FX/securities revaluation cadence.

---

## 1. Executive summary

**What Finance is.** The product area for real-world financial places and relationships — bank
accounts, cash desks, money in transit, money owed to/by employees and shareholders, financing
facilities, and (later) securities — each an object the user manages that _links to_ GL accounts,
postings, periods, and counterparties. Not a list of GL accounts (task §1).

**Starting point (verified by me).** Finance is a **new module** in a nearly-empty new tree: the nav
has only Company + Debug today [B§1]. There is **no** bank/cash/loan/fx/payment/security/institution/
transfer table in the schema [B§6] — the whole money-domain is net-new tables. Only three archetypes
exist — **Table, Details, Blank** [B§2]; there is **no Dashboard archetype**, so a finance overview is
new design-system chrome, not a page build.

**What's already decided (so Finance uses it, does not re-invent).** Money = `Money<Currency>` over
`numeric(19,4)`, cross-currency only via `FxRate.convert`, hard ČNB rules, books CZK-only v1
(ADR-0013) [B§5]. `accounting_period` already carries `fx_rate_policy` (DAILY|FIXED) and the org
accounting currency [B§6b]. Balances come from the trigger-maintained read-model `account_period_balance`
[B§6]. Saldokonto (`open_item` + `open_item_settlement`, VS-matching) is the AR/AP engine [B§6b].

**Main design decisions (detail §3–§5; genuine open items in §12).**

1. **One `financial_account`** table (`kind` ∈ BANK|CASH|CASH_EQUIVALENT) backs bank accounts, cash
   desks, and ceniny. A `location=CASH|BANK` split exists today only on `posting_monetary_line` in the
   SINGLE_ENTRY/TAX_RECORDS regime [B§6b]; DOUBLE_ENTRY keys the money leg by `account_id` (no location
   enum), so for double-entry orgs `financial_account` IS the net-new operational dimension. Each
   account gets its own analytic GL account so its balance is a single read-model lookup [B§6].
2. **One `financing_facility`** table (`facility_kind`, `direction`) backs all four financing pages +
   shareholder loans; sub-tables for drawdowns / repayments / schedule. Counterparty is referenced
   via the composite FK `(counterparty_id, workspace_id)` because `counterparty` is workspace-scoped
   [B§6b] — so the facility row carries `workspace_id`.
3. **Employee & shareholder money = views over `open_item`** (335/333, 355/365) keyed by counterparty,
   not new balance tables. Finance references identity, never duplicates it.
4. **`fx_rate` table + `FxRate.convert` + ČNB ingest** are the known deferred build item (ADR-0013
   names them as follow-up) [B§5] — the multi-currency prerequisite (Phase 0).
5. **Overview and bank-statement reconciliation need chrome that doesn't exist** (no Dashboard
   archetype [B§2]; no dual-list pattern). Both are flagged, not assumed buildable (§12).

**Accounting corrections carried in (verified by me against the KB).** Non-bank loans use **249/479**,
not the baseline's non-existent 233/462 [A13]; there is no 068 [A23]; ST/LT reclassification is **two
different mechanics** — same-account presentation split (355, 351-with-sub-accounts) vs cross-account
move (461→231, 365→479) [A/B6].

**Largest risks.** (a) Under-scoping reconciliation/overview as "just a Table" when the chrome isn't
there. (b) The FX prerequisite being bigger than one page. (c) Getting the ST/LT mechanic wrong per
account. (d) The `counterparty` workspace-tier boundary in employee/shareholder views.

**Genuine open questions (§12):** 067-vs-069 for third-party LT loans [A24]; overview + reconciliation
chrome; securities scope; ceniny as a `kind` vs sub-ledger; whether to persist constant/specific
symbol. (No money-representation or GL-granularity questions — both are settled facts.)

---

## 2. Information architecture — the Finance module (fresh, for the new tree)

Designed to the new-tree nav model (a rail module + a sidebar tree that grows one page at a time,
labels as `org.nav.*` keys, hrefs via `orgHref`) [B§1]. Every page maps to one of the **three real
archetypes** [B§2]; where a concept needs chrome that doesn't exist, it is marked `NEW-CHROME`.

```text
Finance  (new rail module — orgRailNav gains a "finance" entry; sidebar = financeNav())
│
├── Bankovní účty            Table  → Details            (financial_account, kind=BANK)
├── Pokladní účty            Table  → Details            (kind=CASH; ceniny = kind=CASH_EQUIVALENT)
├── Peníze na cestě          Table + inspector           (261 + money_transfer; match candidates + confirm in inspector)
├── Peníze u zaměstnanců     Table                       (view over open_item 335/333)
├── Peníze u společníků      Table                       (view over open_item 355/365/479)
├── Financování              Table  → Details            (financing_facility; facility_kind filter)
│      (one page, faceted by kind: Bankovní / Nebankovní / Vnitroskupinové / Půjčky — OR 4 sidebar
│       leaves over the same entity; §2.1 decides)
├── Cenné papíry a podíly    Table → Details (on demand)  (security_holding; register, §0 — not Blank)
└── Číselníky (reference)
    ├── Formy úhrady         Table                        (payment_method)
    ├── Peněžní ústavy       Table                        (financial_institution — shared directory)
    ├── Měny                 Table                        (currency + org_currency enablement)
    ├── Kurzy                Table                        (fx_rate + ČNB import)
    └── Konstantní symboly   Table (optional, §12)        (constant_symbol)

(Přehled overview = a later phase, built from the existing Table/Details archetype + inspector — NOT a
 new Dashboard archetype [Hleb 2026-07-20: no new archetypes/variants]. Not shipped as a decorative page.)
```

### 2.1 IA decisions

| Question                              | Decision                                                                                                                                            | Ground                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Finance as its own module?            | Yes — a new rail module, sidebar grows page-by-page                                                                                                 | new-tree nav model [B§1]                                            |
| Overview page?                        | **Later phase, built from existing Table/Details + inspector** (no Dashboard archetype)                                                             | [Hleb: no new archetypes/variants]                                  |
| Credit types = one page or four?      | One `financing_facility` entity; **UI = a faceted Table** (kind filter) with an option to split into 4 sidebar leaves later                         | task §2.2 allows shared model + separate pages; keep nav lean first |
| Employee/shareholder money?           | A Finance Table **and** a contextual tab on the counterparty                                                                                        | same view, two entry points                                         |
| Reference data placement?             | Finance **Číselníky** — flat `financeNav`, `ciselniky` in the route (`finance/ciselniky/*`), mirroring the Directory module (NOT a grouped sidebar) | Finance-operational; matches the fresher in-tree sibling precedent  |
| Peněžní ústavy?                       | Shared system directory (Case B), org rows only where needed                                                                                        | avoid per-org duplication (task §3.2)                               |
| Reconciliation (bank statement ↔ GL)? | **Table + inspector** — statement/transfer rows in the Table, match candidates + confirm-match action in the inspector; no new archetype            | [Hleb: no new archetypes/variants]                                  |
| Securities?                           | Deferred (Blank placeholder)                                                                                                                        | net-new + valuation complexity; §12                                 |

---

## 3. Operational vs accounting objects (task §6.2)

Users create **operational** objects; the system generates/links the **accounting** objects [B§4/§5].

| User creates directly                          | System generates / links                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `financial_account` (bank/cash/ceniny)         | its analytic GL account (221.00x/211.00x/213.00x), postings, balance from read-model |
| `financing_facility` (+ drawdowns/repayments)  | GL link(s), postings, schedule-derived ST/LT split                                   |
| `money_transfer`                               | two 261 legs + postings                                                              |
| cash/bank documents (receipt/expense/transfer) | postings, doklad number via `number_series`                                          |
| — (nothing)                                    | employee/shareholder net position = derived view over `open_item`                    |

**Rule:** a negative `221` does not create a second bank account — it changes the _accounting
presentation_ (reclass toward bank credit), never the operational identity [A row 221].

---

## 4. Entity model (task §6.1) — grounded in the verified schema

All new tenant tables: org-scoped, FORCE RLS, `organization_id` + pgPolicy on
`current_setting('app.organization_id')`; cross-FK isolation via composite `(fk, organization_id)`;
reads `withOrgReadonly`, writes `withOrganization` [B§4, B§7]. Amounts `numeric(19,4)` / `Money<Currency>`
[B§5]. Adopt each table via the verified pipeline (migration → schema → `@workspace/accounting` reads
→ `lib/org` edge → `/v1`) [B§4].

### 4.1 `financial_account` (NEW, org-scoped)

- **kind** BANK | CASH | CASH_EQUIVALENT; **name**, **code**, **currency_code** (FK `currency`),
  **gl_account_number** (analytic under 221/211/213), **status** (DRAFT→ACTIVE→INACTIVE→CLOSED→ARCHIVED).
- BANK: `institution_id` (FK `financial_institution`), `account_number`, `bank_code`, `iban`, `bic`,
  `is_default_payment_account`, `overdraft_limit`, `opened_on`/`closed_on`, `responsible_user_id`.
- CASH: `responsible_user_id`, `location`, `cash_limit`, `number_series_id`.
- **Balance** never stored — read live from `account_period_balance` by the account's GL account +
  period (one PK lookup) [B§6]. Statement balance stored per import (Phase 3). **1:1 analytic per
  account** (so the read-model returns one account's balance — a schema invariant) [B§6].
- Audit → `audit_event`; attachments (statements) → `inbox_attachment` [B§6].

### 4.2 `financing_facility` (+ `facility_drawdown`, `facility_repayment`, `facility_schedule`) (NEW, org-scoped, **carries workspace_id**)

- **facility_kind** BANK_LOAN | NONBANK_LOAN | INTRAGROUP | PRIVATE; **direction** BORROWING | LENDING;
  **counterparty_id** + **workspace_id** (composite FK `(counterparty_id, workspace_id)` — counterparty
  is workspace-scoped [B§6b]); **currency_code**; **principal_amount**; **status**
  (DRAFT→ACTIVE→(REFINANCED|REPAID)→CLOSED→ARCHIVED); **gl_account_number** (+ ST/LT pair where the
  resolved account+direction reclassify cross-account, §5).
- Optional: contract_number, credit_limit, interest_type/rate/calculation, fees, start_date,
  final_maturity_date, collateral, guarantees, covenants, is_zero_interest (PRIVATE shareholder case
  [A shareholder-loan]), transfer_pricing_terms (INTRAGROUP).
- **Outstanding** = Σ drawdowns − Σ principal repayments (event-sourced); GL balance is the cross-check.
  **ST/LT** = presentation over `facility_schedule`; cross-account reclass posting only where §5 says.

### 4.3 Views (NOT tables): `employee_balance` / `shareholder_balance`

- Projections keyed by `counterparty_id`, presenting **net position** with both directions preserved
  (task §1). **Sourcing (Advisor/refutation fix, verified):** only accounts flagged `tracks_open_items`
  produce `open_item` rows, and `DEFAULT_OPEN_ITEM_ACCOUNTS` (setup.ts:198-212) tracks **335, 355, 365,
  361** but **NOT 333, 479, 351**. So `saldoPerPartner` [B§6b] gives the _tracked_ legs (employee
  receivable 335, shareholder receivable 355 + ST payable 365); the **untracked legs (333 firm-owes-
  employee, 479 LT shareholder payable) must come from `account_period_balance`** by analytic account,
  or those accounts be flagged `tracks_open_items` per org. The view = `open_item` UNION read-model.
- **479 is a shared non-partner LT catch-all** — attributing it to a specific shareholder needs an
  **analytic dimension** the plan does not yet specify (this is the task's own "shared 479 across
  unrelated relationships" edge case) → §12 open.
- Cross-tier: `open_item`/`account_period_balance` are org-tier, `counterparty` workspace-tier [B§6b] —
  resolve counterparty ids inside the org read, names via the workspace tier (§12 technical).

### 4.4 Reference entities

- `currency` EXISTS (Case-B shared) [B§6b]; **`org_currency`** NEW (org enablement).
- **`fx_rate`** NEW (Phase 0; ADR-0013 deferred item [B§5]): from/to currency, rate_date, rate_type
  (the existing `fxRateKind` enum is **`DAILY | REAL | FIXED`** — three values, `_enums.ts:119`, verified;
  no extension needed for these), source (CNB/manual), rate, is_locked, override reason/user. Feeds
  `FxRate.convert`. (`accounting_period.fx_rate_policy` uses the same enum.)
- **`financial_institution`** NEW — peněžní ústavy, shared system directory (Case B) seeded from the
  ČNB bank-code list; org overrides where needed.
- **`payment_method`** NEW — formy úhrady; persist the intake vocabulary (`cash|transfer|card|other`)
  [B§6/task] + flags. `constant_symbol` NEW, OPTIONAL (§12 — legally optional since 2011 [A konst]).
- **`money_transfer`**, **`statement_import`/`statement_line`** NEW (Phase 3).
- **`security_holding`** NEW — DEFERRED (§12).

### 4.5 Domain map — relationship / ownership / source-of-truth (task §15.2)

**Relationships:** financial_account →N:1 currency, →N:1 financial_institution (BANK), →N:1 account(GL
analytic), →1:N statement_import; money_transfer →N:1 source/dest financial_account; financing_facility
→N:1 counterparty (composite `(counterparty_id, workspace_id)`), →1:N drawdown/repayment/schedule,
→N:1..2 account(GL, ST+LT for cross-synthetic kinds); employee/shareholder views →derived from
open_item + account_period_balance keyed by counterparty; fx_rate →pair of currency.

| Data                                               | SoT owner                                 | Finance role                                        |
| -------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| chart/postings/journal/balances/periods            | Accounting                                | reads balances, requests postings (gated)           |
| counterparty identity (name/ICO/DIČ)               | Workspace (`counterparty`)                | references via composite FK; never duplicates       |
| employee roster                                    | HR (future — none)                        | references once it exists; today counterparty-keyed |
| shareholder/ownership                              | Corporate (future — none)                 | references; today counterparty + facility           |
| currency + fx rates                                | Platform (global + new fx service)        | enables per org; Kurzy manages, accounting consumes |
| bank-code directory                                | Platform (shared `financial_institution`) | reads; org override rows                            |
| financial_account / facility / security / transfer | **Finance (NEW)**                         | owns outright                                       |
| attachments / audit / number series                | Platform infra                            | reuses                                              |

---

## 5. Accounting mapping (task §4/§15.7) — verified

Status: **CONF-KB** (I re-verified against the KB myself) / **CONF-LAW** / **OPEN** (advisor/Hleb).
Reclass column marks the mechanic (§5.1). Full cited table in `10-accounting-claims.md`.

| Finance concept                       | GL account(s)                                      | Direction                   | ST/LT reclass                                                                            | Status                                                                                              |
| ------------------------------------- | -------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Bank account                          | **221** (analytic per account)                     | Aktivní (can go negative)   | none; negative → present as bank credit 231/461 (no KB rule for the auto-posting → OPEN) | CONF-KB [A]                                                                                         |
| Cash till                             | **211**                                            | Aktivní                     | none                                                                                     | CONF-KB [A]                                                                                         |
| Ceniny                                | **213**                                            | Aktivní                     | none                                                                                     | CONF-KB [A]                                                                                         |
| Money in transit                      | **261**                                            | both legs; ≈0 at period-end | none                                                                                     | CONF-KB [A]                                                                                         |
| Employee owes firm                    | **335**                                            | Aktivní                     | short-term by nature                                                                     | CONF-KB [A]                                                                                         |
| Firm owes employee                    | **333**                                            | Pasivní                     | short-term                                                                               | CONF-KB [A]                                                                                         |
| Shareholder receivable                | **355**                                            | Aktivní                     | **presentation split** (same account)                                                    | CONF-KB [A]                                                                                         |
| Shareholder payable                   | **365** (ST) → **479** (LT)                        | Pasivní                     | **cross-account** at >1yr                                                                | CONF-KB [A]                                                                                         |
| Bank loan                             | **231** (ST) / **232** eskont / **461** (LT)       | Pasivní                     | **cross-account** 461→231 at <1yr                                                        | CONF-KB [A]                                                                                         |
| Non-bank loan (borrower)              | **249** (ST) / **479** (LT) — NOT 233/462          | Pasivní                     | cross-account                                                                            | CONF-KB [A13] (baseline 233/462 don't exist — verified)                                             |
| Intragroup, lender LT                 | **066** (control) / **067** (sig. influence)       | Aktivní                     | dedicated LT                                                                             | CONF-KB [A]                                                                                         |
| Intragroup, lender ST                 | **351** (+ 351.100/351.200 sub-accounts)           | Aktivní                     | **sub-account reclass posting** (§5.1-2; NOT no-posting)                                 | CONF-KB [A] — corrected via refutation, KB `03-intercompany-loans.md:61`                            |
| Intragroup, borrower LT / ST          | **471/472** (LT) / **361** (ST)                    | Pasivní                     | cross-account (471→361 detail = OPEN, thin in KB)                                        | CONF-KB / partial [A]                                                                               |
| Private loan (firm lends 3rd party)   | **378** (ST) / **069 or 067** (LT)                 | Aktivní                     | LT account unresolved                                                                    | **OPEN** [A24] — 067="podstatný vliv" doesn't fit an unrelated party; 069 is the better textual fit |
| Private loan (firm borrows 3rd party) | **249** (closest; def. names shareholders/related) | Pasivní                     | —                                                                                        | **OPEN** [A25] — no exact KB account                                                                |
| Securities — participations           | **061/062/063** (by control)                       | Aktivní                     | intent-based, NOT maturity                                                               | CONF-KB [A]                                                                                         |
| Securities — debt HTM                 | **065** (LT) / **256** (≤1yr)                      | Aktivní                     | intent-based                                                                             | CONF-KB [A]                                                                                         |
| Securities — trading/AFS              | **251/253/257**                                    | Aktivní                     | intent-based                                                                             | CONF-KB [A]                                                                                         |
| Securities — treasury                 | **252** (shares) / **255** (bonds)                 | contra-equity (252)         | presented in equity                                                                      | CONF-KB [A]                                                                                         |
| FX difference (monetary FC items)     | **563** loss / **663** gain                        | P&L                         | realized@settlement + unrealized@rozvahový den, ČNB daily                                | CONF-LAW (§60 vyhl 500/2002, ČÚS 006, §24/6 zák 563/1991) [A]                                       |

### 5.1 The reclassification mechanics — THREE, not two (refutation-corrected, verified by me)

1. **Pure presentation split (no posting)** — balance stays on one account; only the balance-sheet
   row changes at rozvahový den. Applies: **355**. Model = a _computed_ ST/LT field.
2. **Sub-account reclass posting** — a posting moves the balance between analytic sub-accounts of the
   **same synthetic**. Applies: **351** (KB `03-intercompany-loans.md:61`: `351 Class-3 sub MD → 351
Class-4 sub D` — a real MD/D entry, NOT no-posting; I mis-classed it with 355 originally). Model =
   a reclass posting between analytics; the synthetic (351) is unchanged.
3. **Cross-synthetic move (posting)** — balance moves to a different synthetic at <1yr. Applies:
   **461→231, 365→479**. Model = a reclass posting + an ST+LT account pair on the facility.
   Securities (06x↔25x) are **none of these** — intent/control-based, no term-shortening reclass.
   ⇒ `financing_facility.reclass_mode` derives from the **resolved account + direction**, never from
   `facility_kind` alone. (471→241/361 borrower-ST target is thin/contradicted in the KB → §12 open.)

## 6. Balances, status, period-lock, multi-currency (task §6.3–6.6)

- **Balances** (§6.3): live from `account_period_balance` (opening/turnover/closing, GENERATED)
  [B§6]; facility outstanding event-sourced; per-partner net from `saldoPerPartner`/`open_item`
  [B§6b]. FC amount stored; CZK equivalent via `FxRate.convert` (Phase 0). Nothing snapshotted at MVP.
- **Status** (§6.4): separate fields per lifecycle — account, facility, reconciliation
  (UNMATCHED→SUGGESTED→MATCHED→CONFIRMED), repayment (PLANNED→DUE→PAID→OVERDUE), import, and the
  existing accounting held-writes gate (HELD→APPLIED|REJECTED). Never one generic status.
- **Period-lock** (§6.5): the `accounting_period.status` OPEN|CLOSED gate exists [B§6b]; the exact
  enforcement (CLOSED-period rejection trigger + advisory lock) and the final `period_lock` shape are
  **to verify before Phase 2** (the period mechanism is still an open repo decision — don't assert the
  trigger as given). Regardless of enforcement detail, Finance behavior = **block** (never silently
  rewrite) locked-period writes, target the next open period, and post corrections as new postings
  (forward-fix).
- **Multi-currency** (§6.6): ČNB daily at rozvahový den; unrealized → 663/563; intra-period per
  `accounting_period.fx_rate_policy` (DAILY|FIXED, already exists) [B§6b]; a period-end "revalue FX
  balances" action (Phase 7) mirrors ČÚS 006 [A]. Two KB advisor-pack open items (EUR-pokladna
  revaluation cadence; FX-loan interest/principal on 31 Dec) → §12.

## 7. Page specifications (task §8/§15.4) — mapped to the 3 real archetypes

Shared **List (Table) + Detail (Details)** template; per-page deltas only (avoids reinventing 10
specs). Table chrome via `buildTableToolbar`/`buildTableFooter`; flat Table auto-generates its column
filter (don't pass one); inspector tabs Details/Activity/Attachments/More (no Settings); sections
minted client-side [B§3]. Blank = empty/not-yet-built leaf.

**Shared List shell:** header (title, period + lock badge, balance-summary strip since flat tables
have no footer total [B§3], primary action, favorite); toolbar (search, status facet, auto column
filter, column manager); table (one row/entity, id-role column drives inspector, virtualized, no
pagination); inspector rail (Details + a money-totals block, Activity, Attachments, More); footer
(Export split-button, result count, selected-row aggregate).
**Shared Detail shell:** `details-form` summary + `details-tabs` {Balance & accounting, Transactions,
Documents, Schedule/Interest (facilities), Currency, Attachments, Audit, Period history} +
`details-table` sections. Governed by `ARCHETYPE_SECTION_POLICY` (table/details only) [B§2].

| Page                  | Archetype         | Primary entity                 | Header extras                                    | Key columns                                                                                                                             | Detail adds                                                   | Primary actions                                             |
| --------------------- | ----------------- | ------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Bankovní účty         | Table+Details     | financial_account(BANK)        | balance summary, currency chips, missing-GL warn | name, code, institution, IBAN(masked), currency, GL acct, accounting balance, statement balance, diff, status, default-pay              | Reconciliation tab                                            | New account, Import statement                               |
| Pokladní účty         | Table+Details     | financial_account(CASH/CENINY) | cash total, over-limit warn                      | +responsible, cash_limit, kind                                                                                                          | Cash-count tab                                                | New desk, Cash count                                        |
| Peníze na cestě       | Table + inspector | money_transfer / 261           | 261 balance, >5d ageing                          | source, dest, amount, dates, match state                                                                                                | inspector = match candidates + confirm-match                  | New transfer, Confirm match                                 |
| Peníze u zaměstnanců  | Table             | employee_balance view          | net/receivable/payable totals                    | counterparty, net, receivable(335), payable(333), currency, overdue                                                                     | contextual                                                    | Issue advance, Settle                                       |
| Peníze u společníků   | Table             | shareholder_balance view       | net, ST/LT                                       | counterparty, net, receivable(355), payable(365/479), ST/LT, overdue                                                                    | contextual                                                    | Record loan, Repay                                          |
| Financování           | Table+Details     | financing_facility             | drawn/outstanding/limit, next repayment          | counterparty, kind, direction, limit, drawn, outstanding, ST/LT, next repay, overdue, currency, status                                  | Schedule + Interest tabs                                      | New facility, Drawdown, Repayment                           |
| Cenné papíry a podíly | Table+Details     | security_holding               | portfolio total, kind chips                      | kind, classification, issuer/investee, ownership %, ISIN, quantity, acquisition cost, carrying value, currency, valuation model, status | Transactions + Income tabs (revaluation deferred, §0/Phase 7) | Record acquisition, disposal, dividend/interest, impairment |
| Formy úhrady          | Table             | payment_method                 | —                                                | code, name, type, flags                                                                                                                 | inline                                                        | New method                                                  |
| Peněžní ústavy        | Table             | financial_institution          | system/org badge                                 | name, bank_code, BIC, country                                                                                                           | inline                                                        | Add org bank                                                |
| Měny                  | Table             | currency + org_currency        | functional badge                                 | code, name, enabled                                                                                                                     | toggle                                                        | Enable/disable                                              |
| Kurzy                 | Table             | fx_rate                        | rate date, source                                | pair, date, type, rate, source, locked                                                                                                  | inline (manual)                                               | Import ČNB, Override                                        |
| Konstantní symboly    | Table (opt)       | constant_symbol                | —                                                | code, description                                                                                                                       | inline                                                        | New                                                         |

---

## 8. Workflows (task §10/§15.6)

Each: trigger · actor · preconditions · steps · generated records + postings · status · period-lock ·
correction. Grouped by state machine; exemplars detailed.

- **Account** `DRAFT→ACTIVE→INACTIVE→CLOSED→ARCHIVED`: create (form: name/code/currency/institution/
  account-number→validate IBAN/BIC/GL analytic auto-suggest/opening balance+date+protiúčet 395/701) →
  activate (opening posting via write API) → import statements → reconcile → close → archive (blocked
  while balance≠0). Cash adds: receipt/expense (211 posting + doklad number [B§6b], **270k/day cap**
  [A]) · cash count (expected vs counted, diff → 668/569 or 335) · close cash period.
- **Transfer**: `money_transfer` → two 261 legs → match both sides → fee leg → FX diff 563/663 →
  cross-period 261 carries the balance → cancel/correct. >5d unmatched → alert [A].
- **Employee/shareholder**: issue advance (221→335) · settle · reimburse (333→221) · payroll deduct ·
  shareholder record-loan/draw/interest(562)/repay · reclassify (355 presentation / 365→479 cross) —
  route to the write API + refresh the view.
- **Credit** `DRAFT→ACTIVE→(REFINANCED|REPAID)→CLOSED`: create facility · drawdown (221←231/461,
  ≤limit) · generate schedule · repayment · interest (562) · reclassify ST portion (cross-account for
  461/365 kinds, computed for 355/351) · refinance · close. Schedule versioned on rate/term change.
- **Currency**: import ČNB rates (job→`fx_rate`) · override (reason+audit, locked rows immutable) ·
  revalue open balances (period-end 563/663 action) · correct a used rate (adjustment posting, never
  edit the frozen rate [B§5]).

All agent (`actor_kind='agent'`) writes route through the existing held-writes gate — never a direct
post (memory `api-write-endpoints-evidence-signals`). Every mutation → `audit_event` [B§6].

## 9. Integration matrix (task §11/§15.8)

Finance references, never duplicates (task §11). | Domain | SoT | referenced entity | direction | notes |
|---|---|---|---|---|
| Accounting/GL/periods | Accounting | account, posting, accounting_period | Finance→write-API(gated), ←read | held-writes gate; block on closed period |
| Invoices / saldokonto | Invoicing/Accounting | open_item | ←read | VS-match [B§6b] |
| Payments / orders | Finance (NEW) | payment_order | Finance owns | approval gate |
| Bank statements | Finance (NEW) | statement_import | Finance owns | intake IR parsers (CAMT/MT940/ABO) |
| Counterparties/ARES | Workspace | counterparty | ←reference (composite FK) | dedup ICO/DIČ [B§6b] |
| Employees / shareholders | HR/Corporate (future — none) | — | ←reference (counterparty today) | 335/333, 355/365 balances |
| Consolidation/intercompany | Corporate (future) | self_of_organization_id | ↔ | intercompany self-ref [B§6b] |
| Documents/attachments | Platform | inbox_attachment | Finance→store (S3) | statements, contracts [B§6] |
| Audit / permissions | Platform | audit_event / permission_* | ←/→ | append-only; fail-closed |
| Currency/FX | Platform (new fx service) | currency, fx_rate | Finance manages, accounting consumes | ADR-0013 [B§5] |

## 10. Permissions (task §12/§15.9)

Roles from `organization_membership.role` (owner/admin/member/agent/guest) [B§ prior]; Finance adds
capability + field gating, not new roles. **IBAN / full account number / BIC** gated behind
`view_bank_detail` (distinct from `view_balance`). Agent writes always held-gated. Managing accounts /
imports / reconcile / cash / loans / rates = finance-member+; reopen-reconciled = admin+; edit in
locked period = blocked (trigger). Every action audited.

## 11. Migration / onboarding (task §13)

Existing orgs have GL balances but no Finance entities. **Never invent a relationship from an
ambiguous balance** (task §13): detect analytics under 221/211/213/231/461/249/06x/25x/355/365/335/333
with balances → propose **draft** entities the user confirms → shared/ambiguous accounts (249/378/355)
go to an **unmapped-record queue** with the postings so a human decides ownership → validate derived
balance == GL balance → **seed a facility opening-outstanding** event = the ledger balance (else
event-sourced outstanding=0 fails the check) → migration report; drafts reversible, nothing posts
during migration.

## 12. Edge cases + open decisions (task §14/§15.12)

**Edge cases** (v1 / later / unsupported / advisor):

- **v1:** negative bank balance (presentation reclass); FC bank/cash (needs Phase 0); employee-who-is-
  shareholder (two relationships, one counterparty); one counterparty many loans / multi-drawdown /
  irregular repayment / partial-1yr; bank account closed mid-year (CLOSED status, per-period balances);
  **multiple accounts → one GL synthetic** (each has its own analytic — supported by the 1:1-analytic
  invariant §4.1); reconciled item corrected later; payment matched to multiple docs (manual split);
  transaction split across entries (compound posting).
- **later:** refinance / interco-transfer / interest-capitalisation; **one bank account → multiple
  analytics** (violates the v1 1:1-analytic invariant §4.1 — deferred); historical records without
  source docs; data imported from another accounting system (intake IR + migration wizard).
- **advisor:** ceniny sub-ledger vs kind; **missing FX rate** (ADR-0013 = error-on-missing, but the UX
  path — block vs manual entry — needs a call); factoring / bills-payable (směnky) account choice;
  EUR-pokladna revaluation cadence & FX-loan-31-Dec sequencing [A]; 067-vs-069, 471→361.
- **unsupported (v1):** org accounting-currency change (functional currency fixed [B§6b]); org
  merger/split.

**Open decisions — genuine, split product vs accounting-advisor:**

1. ~~Overview + reconciliation chrome~~ **RESOLVED (Hleb 2026-07-20): no new archetypes or variants.**
   Overview + reconciliation are built from the existing **Table (normal/pivot) / Details archetype +
   inspector**. Reconciliation = statement/transfer rows in a Table, match candidates + confirm-match in
   the inspector. No Dashboard, no dual-list, no new chrome.
2. **067 vs 069** for third-party LT loan receivable [A24]; **249 fit** for third-party borrowing
   [A25]; **471→361** ST detail (thin in KB); **479 counterparty attribution** — 479 is a shared
   non-partner LT catch-all, so pinning an LT shareholder payable to a specific shareholder needs an
   analytic dimension (design + accounting-advisor). — accounting-advisor.
3. **Ceniny** = `kind=CASH_EQUIVALENT` + filtered view, or a sub-ledger? (product) — recommend kind+view.
4. **Persist constant/specific symbol?** KS legally optional since 2011 [A]; SS stronger (state-body
   payments). (product)
5. **Securities scope** — defer (recommended) vs pull into an early phase. (product)
6. **Financování** — one faceted Table vs four sidebar leaves over one entity. (product, low-stakes)
7. Two KB AMBER FX items (revaluation cadence, 31-Dec sequencing) — accounting-advisor.

**Settled facts (NOT re-asked):** money representation (ADR-0013) [B§5]; 1:1 analytic per account
[B§6]; balances from the read-model [B§6]; only 3 archetypes [B§2].

## 13. Phases + TODO tree (task §15.10/15.11)

Critical path: **Foundation (FX + financial_account) → reference data → bank/cash → reconciliation →
employee/shareholder → facilities → securities → overview**. Each phase = several ≤800-line PRs, built
ONLY in `o/[orgSlug]`, `lint:org-new` green.

```text
Phase 0 Foundation   fx_rate table + FxRate.convert + ČNB ingest (ADR-0013); financial_account schema
                     + single-account-balance helper; view_bank_detail capability. (unblocks currency + accounts)
Phase 1 Reference    Měny · Kurzy(+ČNB import) · Peněžní ústavy · Formy úhrady   [Table pages]
Phase 2 Bank+Cash    financial_account writes + /v1 + lib/org reads; Bankovní/Pokladní účty [Table+Details];
                     create form + opening balance; migration detect→draft
Phase 3 Reconcile    statement_import + parsers; line matching (reuse open_item_settlement); money_transfer +
                     Peníze na cestě as a Table + inspector (confirm-match in inspector — no new chrome)
Phase 4 Relationships employee_balance / shareholder_balance views + pages (over saldokonto) + contextual tabs
Phase 5 Facilities   financing_facility + drawdown/repayment/schedule; reclass_mode engine (§5.1); Financování page
Phase 6 Cenné papíry a podíly  security_holding + security_transaction register (Table+Details, on demand);
                     acquisition/disposal/dividend(665)/interest(662)/manual-impairment(579/096) — §0
Phase 7 Overview + revaluation overview (Table/Details composition) + period-end action revaluing FX AND
                     securities (fair-value 564/664/414 + impairment) at rozvahový den (ČÚS 006 + 008) — §0
```

Each node carries: goal · deps · domain/backend/frontend/migration/testing · open-qs · acceptance
(expanded at the start of each phase, per the verified pipeline [B§4]).

### 13.1 Engineering rules + consciously-deferred deliverables

- **Every new org-scoped Finance table** (financial_account, financing_facility, fx_rate if org-scoped,
  money_transfer, statement_import, org_currency…) must be **registered in `ORGANIZATION_SCOPED_TABLES`**
  (`packages/db/src/policies/rls.ts` per memory — verify the exact path at build) or the RLS drift test
  reds. Reference/system tables (financial_institution, payment_method, constant_symbol, currency) are
  Case-B (no RLS) if truly shared — decide A/B per table [B§4].
- **Consciously deferred (produced at each page's build kickoff, not in this review-gate plan):** the
  full **§15.5 per-column matrix** (11 attributes/column — §7 gives the column set), the **§15.9
  roles×actions×field permissions grid** (§10 gives the model), and the **§15.10 per-TODO-node fields**.
  A review-gate plan settles architecture + IA + accounting + entities; the fine-grained matrices are
  cheap-but-voluminous and drift fast, so they are authored with the page. This is a deliberate scope
  call, not an omission.

## 14. Decision log (task §15.12)

- **Confirmed:** real-world-object model; one financial_account; one financing_facility; employee/
  shareholder as views (open_item UNION read-model); balances from read-model; reference data minimal;
  249/479/378/069 corrections; **three** reclass mechanics (§5.1); use ADR-0013 money model; only 3
  archetypes; **overview + reconciliation use existing Table/Details + inspector — no new archetype or
  variant (Hleb 2026-07-20)**.
- **Rejected:** separate bank/cash tables (share the location split); one entity per GL number (shared
  accounts need analytics); storing balances on entities; overview-first (no chrome); grounding in
  SITEMAP / old tree (frozen).
- **Open:** §12 items.

---

_Provenance: `00-verified-baseline.md` (repo, read by me) + `10-accounting-claims.md` (accounting,
flagged rows re-verified by me against the KB). Fresh design for the new tree; no old-world IA copied._
<!-- REDO-END -->
