# Application sitemap & information architecture

The page map for the **org application surface** (`apps/web`). This is the
_what_ — the tree of pages, one archetype per page, and the rules for growing
the tree. The _how_ (route folder + nav leaf + the `check:nav` gate) lives in
[`docs/runbooks/APP-SHELL-PANELS.md`](../runbooks/APP-SHELL-PANELS.md); this
doc does not repeat the mechanics, it points at them.

> **Status legend** — ✅ built · 🟡 placeholder (`ModulePage` body, no real
> content yet) · ⬜ planned (agreed, not yet scaffolded) · 🧪 dev-only (404 in
> production).

---

## How to read this doc

- **Code is the source of truth for what is wired.** The rail + module trees
  live in `apps/web/app/[orgSlug]/_nav/org-nav.ts` and each
  `<module>/nav.ts`; `pnpm check:nav` fails if a nav leaf and its route folder
  drift. This doc _mirrors and annotates_ that tree — it adds intent (archetype,
  status, purpose) the code can't carry.
- **A page enters this doc only after it is agreed.** Do not pre-list invented
  subpages. The per-module tables below start with what exists today; new rows
  are added as pages are decided (e.g. from competitor research adapted to our
  modules), then scaffolded, then flipped 🟡/✅.

## The rules (IA conventions)

1. **One module, one rail entry.** Every org page belongs to exactly one rail
   module (or a non-module surface — see [Workspace](#workspace-surface) /
   [Auth & onboarding](#auth--onboarding-flows)). The rail set is fixed and
   cross-module; it changes rarely and only here + in `org-nav.ts`.
2. **One archetype per page.** Pick from the five content-panel archetypes
   (`Table` · `Blank` · `Launchpad` · `Dashboard` · `Single`) — defined in
   [APP-SHELL-PANELS § Content Panel variants](../runbooks/APP-SHELL-PANELS.md#content-panel-variants).
   Only `Table` is fully built today; `Launchpad` / `Dashboard` / `Single` are
   prototype-stage (tracked in issue
   [#425](https://github.com/hlebtkachenko/monorepo/issues/425)).
3. **Nav depth ≤ 3.** Group (label heading) › Page (icon, clickable) › Subpage
   (indented, no icon). The tree **stops at the Subpage level** (3 levels); a
   Page may own **any number of Subpages**, but a Subpage never nests further —
   a fourth level means the module wants splitting. Subpages are real routes
   (own `page.tsx`), distinct from in-page **tabs** (same dataset/lens, no route)
   and per-record **card tabs** (live inside one record's detail view).
4. **Nav is co-located.** A module's tree lives in its own `<module>/nav.ts`;
   the rail + bottom-nav + `MODULE_NAV` registry live in `_nav/org-nav.ts`.
   Adding a page edits the file next to its route folder.
5. **Title is derived, not authored.** The content-panel header title is the
   active nav leaf's label (longest-prefix match). Don't hardcode page titles.
6. **Label ≠ route segment.** The rail _label_ is presentation; the _folder
   name_ / `MODULE_NAV` key is the route segment, and the two can differ (e.g.
   rail "Records" → folder `documents`). The mapping is pinned in the
   [module table](#org-modules-orgslug) below.
7. **Mock data is fine until ship.** Pages may render mock data while the
   backend layer is unbuilt; real data is wired per-page later (no domain
   `Money<Currency>` obligation on mock rows).

---

## Org modules (`/[orgSlug]/…`)

The ten rail modules. **The full depth-3 nav tree (Group › Page › Subpage) is
built for every module; each leaf currently renders a `ModulePage` placeholder
body** — real bodies are filled in per page as they are agreed. Rail order,
icons, and the label↔folder mapping are fixed in `_nav/org-nav.ts`.

| Rail label | Route segment (folder) | `MODULE_NAV` key | Rail icon             | Status                |
| ---------- | ---------------------- | ---------------- | --------------------- | --------------------- |
| Company    | `/[orgSlug]` (index)   | `""`             | `Goal`                | 🟡 nav + placeholders |
| Accounting | `accounting`           | `accounting`     | `Calculator`          | 🟡 nav + placeholders |
| Records    | `documents`            | `documents`      | `FolderBookmark`      | 🟡 nav + placeholders |
| Finance    | `finance`              | `finance`        | `ReceiptEuro`         | 🟡 nav + placeholders |
| HR         | `hr`                   | `hr`             | `Users`               | 🟡 nav + placeholders |
| Assets     | `assets`               | `assets`         | `BriefcaseBusiness`   | 🟡 nav + placeholders |
| Closing    | `closing`              | `closing`        | `CalendarClock`       | 🟡 nav + placeholders |
| Reports    | `reports`              | `reports`        | `ChartNoAxesCombined` | 🟡 nav + placeholders |
| Directory  | `directory`            | `directory`      | `BookUser`            | 🟡 nav + placeholders |
| Settings   | `settings`             | `settings`       | `Settings`            | 🟡 nav + placeholders |

### Design principles (apply to every module)

1. **Agentic, not manual-entry.** Reference platforms are built for humans
   hand-filling millions of rows (posting workstations, manual matching). We are
   above that — the agent captures, posts, matches, and prepares filings; the
   human **reviews exceptions, confirms, and gets insight**. So every module's
   **Overview = a review/attention cockpit** (what the agent did, what needs you),
   NOT a launchpad of tiles. Competitors tell us _what domain objects exist_
   (law-grounded), never _how to structure the UX_.
2. **Agent lives in the Assistant panel** (3rd shell panel) alongside the pages.
3. **Regime-aware nav** — the page set swaps by the active period's regime
   (double-entry ↔ cash). Marked inline.
4. **Single archetype standard** — every document detail = action set (post/pay/
   link/lock/print/export) + **lineage rail** (predecessor → successor) + status
   chips + header/lines.
5. **Settings holds only org-general config; module config lives in its module.**
6. All pages **mock-backed** (no accounting tables in the live DB yet); grounded
   in `.context/sitemap-foundation/` (law + model), competitors as cross-check.
7. **The trust loop is universal.** Every agent mutation flows `Prepared →
(Checks) → Review & confirm → Commit/File`. **Confirm** = the human approval
   gate; **File / destructive** steps are AI-denied (agent prepares, only the
   human submits). Closing terminates at File; posting / capture / payroll-run /
   payment-order terminate at Commit. Same Checks-band + provenance components
   reused everywhere.
8. **Uniform per module.** Every Overview is a review/attention cockpit; every
   module with agent-output gets a **Review** queue (Accounting/HR/Assets today;
   extend to Records capture-exceptions, Finance held-payments, Directory
   validation-flags). Apply the `_(regime-aware)_` / `_(cash regime)_` /
   `_(vat-gated)_` markers on every conditional surface consistently.

### Per-module nav structure

Sidebar = **Pinned** (top, ungrouped) then **Groups** (logical heading → Pages →
Subpages → tabs _inside_ a page). No Reminders / Insight / Footer yet.

> **Build-status tag.** Every nav entry that is still a `ModulePage` placeholder
> carries a `tba: true` in its `nav.ts` — a muted "TBA" chip in the sidebar. It
> has **its own slot**, separate from the live `badge` count (so a page can show
> a real count and TBA at once, and TBA never blocks a real badge). When a page's
> real body ships, **remove its `tba` flag**. Agents list everything outstanding
> with `grep -r 'tba: true' apps/web/app/[orgSlug]` straight off the nav index —
> no need to open each page. All pages are TBA today.

#### Company (`/`) — LOCKED

- **Pinned:** Overview · Inbox (org-filtered link → `/workspace/inbox`) · Tasks
- **Profile** — Company card · People
- **Engagement** — Services (add-ons we provide to _this_ company, not workspace) · Onboarding

> **Overview = the org digest** (content, not new pages): an **obligations mini-cockpit**
> (next deadlines across VAT / payroll / income-tax / close — a **read-only digest**;
> the actionable cockpit is Closing, deep-linked), the org-level **agent-activity feed**,
> an **anomalies pin** (the agent's flagged variance/exceptions for this org), and — for a
> **neplátce** org — a **rolling-12mo turnover gauge** with a VAT-registration-threshold alert
> (§6 ZDPH **2,000,000 CZK/yr** → mandatory _plátce_; §6c _identifikovaná osoba_ → _plátce_ at
> **2,536,500 CZK** rolling-12m). This is the **only proactive obligation a neplátce has** — every
> Closing VAT lane is gated off for them, so the watcher's home is here, not Closing. The
> cross-client versions live in `/workspace`.

#### Accounting (`/accounting`) — the books (regime-aware) — REVIEWED

- **Pinned:** Overview (books vitals: period posting status · open-item & analytical↔synthetic reconciliation) · **Posting approvals** (the AI→human approval path — the Assistant's automatically-prepared postings wait here for a human to review + approve; unposted + low-confidence + this-org exceptions; cross-client queue lives in `/workspace/inbox`)
- **Books** _(regime-aware; ordered by regime — TODO(regime))_ — the statutory **účetní knihy** (563/1991 §13)
  - _cash regime (jednoduché / daňová evidence):_ **Cash journal** (peněžní deník) is the primary book — shown **first**; the double-entry books below are hidden.
  - _double-entry:_ Journal (deník) · General ledger (hlavní kniha) · **Saldokonto** · **Off-balance ledger** (the statutory 4th book _kniha podrozvahová_ §13 — guarantees / leased-custody / off-balance items — its own page) · Analytical ledger (knihy analytické evidence) · Trial balance (obratová předvaha) — Cash journal hidden.
- **Structure** _(regime-aware)_
  - _double-entry:_ Chart of accounts (účtový rozvrh) · Posting rules (předkontace — agent posting config, no statutory book)
  - _cash regime:_ Categories (income/expense — replaces the chart)
  - **Posting checks** (Kontroly) — rule-based posting-validation register (balanced MD/Dal · valid account/regime · DUZP-in-period · saldo-tie); **distinct from the Review work queue** (Review = agent-output triage; Checks = deterministic rule results). Feeds the shared Checks band.
  - **Opening balances** (počáteční stavy / period init — _inicializace období_) — entry of opening account/saldo/VAT balances when a period or migration starts _(period-init flow / wizard, not config)_
- **VAT** _(gated on vat_status — plátce / IO only)_
  - **VAT ledger** — 343 evidence; subpages: **Input VAT** (odpočet) · **Output VAT** (daň na výstupu) · **Reverse charge** (přenesená daňová povinnost §92a–92h — supplier A1 / buyer B1) · **Breakdown** (by rate / section — maps to control-statement sections A1–A5 / B1–B3, §101c–101j) · **Supporting documents** (podklady DPH — the source-document evidence backing the VAT return)
- _Number series → Settings (org-general, spans all entity types). DPH filings → Closing._

> **Margin schemes (§89 travel service / §90 second-hand · art · collectors)** post VAT on the
> **margin only** (no tax itemised on the doklad) — so they change posting, not just reporting.
> Modelled as a **VAT-scheme flag on the doc type** + a **margin rate-mode** in the VAT ledger
> Breakdown. **V2-DEFERRED — declared, not built** (niche: travel agencies / used-goods & art dealers).

#### Records (`/documents`) — all documents, "what's on paper" — REVIEWED

- **Pinned:** Overview (recently captured · to-review · capture exceptions) · **Inbox** (document capture-intake — uploads / e-mail / data-box / ISDOC land here; agent OCRs + proposes a voucher; "to classify" queue. _This is documents to classify — a different dataset from `/workspace/inbox` (the cross-org `user_task` queue) and Company's Inbox link._)
- **Invoices & vouchers**
  - **Invoices** — subpages: Received (faktury přijaté) · Issued (faktury vydané). _Named subtypes (tabs/filters inside the list): ordinary faktura (neplátce / IO, no DPH) · daňový doklad (plátce ≥ 10,001) · zjednodušený daňový doklad (≤ 10,000) · souhrnný daňový doklad (§26)._
  - **Advances** — zálohové faktury / proformas + **daňový doklad k přijaté záloze** (advance tax document, §26/§20; drives the advance→invoice→settlement lineage) — subpages: Received · Issued
  - **Credit & debit notes** — opravné daňové doklady: **dobropis** (credit) / **vrubopis** (debit), referencing the original (§45) — subpages: Received · Issued
  - **Obligation documents** — non-invoice payable/receivable vouchers (ostatní závazky/pohledávky); the _paper_ — balances live in Finance — subpages: Payable · Receivable
- **Other documents**
  - **Loan documents** — úvěrové doklady (the paperwork; loan money movements → Finance) _[mock — no model entity yet]_
  - **Internal documents** — interní doklady (accruals · depreciation · self-assessment · corrections) — subpages: Internal · **Customs declaration** (jednotný správní doklad / SAD — drives the import-VAT line; import VAT levied by customs at entry, Act 235/2004)
- **Recurring templates** — periodická fakturace + recurring/periodic document templates (agent issues on schedule; human reviews the batch) _[mock — no model entity yet]_ _(document-issuance schedules; org-general scheduled jobs → Settings › System › Recurring tasks)_
- _Bank/cash documents → Finance. Tax-application (uplatnění daně) → Closing/DPH. Single detail = standard: header/lines + lineage rail + action set._

#### Finance (`/finance`) — cash-flow, "real money" — REVIEWED

- **Pinned:** Overview (cash position + cash-flow forecast · what needs action) · **Accounts** (register of all money accounts — bank accounts + cash points — with balances)
- **Treasury** — Bank (subpages: Movements · Statements · Reconciliation) · **Cash in hand** (pokladna / hotovost) · Loans (subpages: Movements · **Statements** (úvěrové výpisy — the statement feed; the loan-agreement paperwork lives in Records › Loan documents))
- **Receivables & payables** _(balances from real payments; also the mandatory cash-regime AR/AP registers)_ _[derived — saldokonto views over postings + counterparty; output/views layer V2-DEFERRED]_ — Receivables (subpages: Ageing · **Debtors** (dlužníci — by-partner)) · Payables (subpages: Due · **Creditors** (věřitelé — by-partner))
- **Collections** _(payment control — kontrola úhrad)_ — **Dunning** (upomínky — agent-prepared reminder letters by ageing stage) · **Penalisation** (penále — the **booked** late-interest run: Prepared → Commit; distinct from the throwaway Calculators penalty estimate, which posts nothing)
- **Payments** — Payment orders (příkazy k úhradě; reliability check warns before paying an unreliable plátce) · Settlements (zápočty — clearing/netting, no cash movement; subpages: Bilateral (vzájemný) · Multilateral (vícestranný)) · **Bulk reconciliation** (hromadné párování — auto-match cockpit: bank movements ↔ open AR/AP, agent-proposed, human-confirmed) · **Calculators** _(stateless helpers, not posting surfaces)_ (subpages: FX (kurzová) · Penalty (penále) · Cash denomination (výčetka platidel))

> **Cross-module dependencies** (stated, not pages here): Counterparties =
> **Directory** (workspace-shared, referenced by every invoice/AR/AP). Number
> series = **Settings**. DPH filings + uplatnění daně = **Closing**.
> Statements / saldo reports = **Reports**.

#### HR (`/hr`) — people & payroll — REVIEWED _[mock — no v2 payroll entity yet]_

Mined from Money _Režie_ (Mzdy + Jízdy) + Abra _Personalistika_.

- **Pinned:** Overview (payroll status · filings due) · **Payroll approvals** (the AI→human approval path — agent-prepared payroll runs wait for human review + approval; + exceptions)
- **People** _(gated: has_employees)_ — Employees (zaměstnanci; _per-record card tabs, not nav:_ employment relationships · taxpayer declaration [per tax-year] · allowances & reliefs · **Deductions** (exekuce / insolvency / savings) · **Personnel docs**) · Agreements (subpages: **Task agreement** (DPP) · **Activity agreement** (DPC))
- **Payroll** _(gated: has_employees)_ — Payroll runs (+ payslips) · Payroll posting (→ payment orders) · Attendance (absences) · **Sickness e-filing** (electronic sick-notes & benefit claims → ČSSZ) · Payroll reports (subpages: **Income-tax reconciliation** (annual employer statement of dependent-activity tax, §38j) · **Withholding-tax reconciliation** · Health insurance · Social insurance [incl. **DPP report**] · Tax statements · Sick-pay) · **Payroll sheets** (mzdové listy — per-employee annual statutory register, §38j; 30-year retention, Act 582/1991 §35a) · **Pension record** (evidenční list důchodového pojištění → ČSSZ)
- _Vehicles / fleet (vozidla · kniha jízd · řidiči) → **Assets › Fleet** (vehicles are assets)._

> **2026 reforms kept (do NOT drop despite stale KB):** **JMHZ** (Jednotné měsíční
> hlášení zaměstnavatele — unified monthly employer report) + single collection point
> → runs in **Closing** (payroll lane, 20th), reporting to **Institutions** (Directory).
> _JMHZ is NOT in the KB law layer (01-kb-law §G1) — it ships as a confidence-flagged
> superset lane; the legacy SP / ZP / withholding přehledy remain the verified path and
> MUST stay (JMHZ does not displace them in the doc)._
> Reference/config → **Settings**: nastavení mezd (legislativa · způsoby zaúčtování ·
> svátky) · mzdové složky · typ pracovního poměru · skupiny osob · cestovní náhrady.
> Gates: People/Payroll on `has_employees`; OSVČ own-contributions → Closing
> (`person_type = NATURAL`, none on paušál). Payroll computed → posting → **Accounting**.

#### Assets (`/assets`) — fixed assets & inventory (regime-aware) — REVIEWED

Mined from Money _Majetek_ (+ karta majetku) + Abra _Majetek_ + Evala.

- **Pinned:** Overview (depreciation due · inventory due · exceptions) · **Asset approvals** (the AI→human approval path — agent-prepared commissioning / disposal events wait for human review + approval; + exceptions)
- **Register** _(regime-aware)_ — Fixed assets (subpages: Intangible assets (01x) · Tangible assets (02x) · Land & artwork (03x, non-depreciable)) · Small assets (low-value) · Acquisitions & disposals (lifecycle; subpages: **Under construction** (04x — not yet commissioned) · **Advances** (asset prepayments 05x) · Disposals) · **Leasing** _[mock — no lease entity]_ (subpages: Contracts · Instalments — types finance / operating / sale-and-leaseback; the 3 posting flows: instalment posting · leased-asset posting · technical-improvement on leased asset 029)
- **Operations** — **Depreciation run** _(regime-aware: double-entry posts účetní odpisy; cash → daňové-only evidence)_ (zaúčtování majetku — agent posts účetní odpisy MD 551 / D 08x for the period; human confirms) · **Inventory count** (inventarizace — `inventory_count` + lines; manko 549 / přebytek 648)
- **Fleet** _[mock — no vehicle entity]_ (moved from HR — vehicles are assets) — Vehicles (vozidla) · Trip log (kniha jízd) · Drivers (řidiči)
- Asset card = header + _detail tabs (not nav):_ **Movements** (pohyby) · **Účetní odpisy** · **Daňové odpisy** · **Assigned** (přiřazené) · Location (umístění) · Notes. Card events: **Technical improvement** (technické zhodnocení → 029, raises cost basis). Fields: acquisition/disposal method · odpisová skupina (1–6) · depreciation method (účetní; daňové method is **irrevocable** once chosen, §30/2 — the §31/§32 method cannot change for the whole depreciation period) · primary accounts (majetku / oprávky / odpisů) · středisko / zakázka. _(regime-aware: cash → evidence majetku, daňové-only)_

> Cross-module: inventarizace _flow_ + deferred-tax _(audit-required entities, §59 Decree
> 500/2002 — proxied by size MEDIUM/LARGE until an is_audited flag exists)_
> → **Closing** (the register lives here). Reference/config → **Settings**: asset types
> (typy majetků) · locations (umístění) · depreciation groups (odpisové skupiny).
> Financial assets (06x) out of MVP. Off-balance/leased-custody = Accounting GL tab.
> (Vehicles → HR · Jízdy.)

#### Closing (`/closing`) — unified period-close cockpit (THE UVP) — REVIEWED

Close ANY period (month/quarter/year × VAT · income-tax · payroll · accounting) from
ONE place. Agent prepares; human reviews → confirms → **files** (only the human can
file — AI-denied). No competitor unifies this.

- **Pinned: Overview** — the cockpit: a **board** of every open obligation
  for THIS org, **regime-derived** (no VAT lane for neplátce; DPFO not DPPO for FO;
  přehledy not závěrka for jednoduché; OSVČ-contributions lane for OSVČ). Each row =
  status · deadline · amount; deep-links into that period's flow. Filter/lens by kind.
- **Pinned: Calendar** — daňový kalendář, the dedicated **time-view** destination of the same obligation set (a recognized accountant artifact; the board is the action/status framing, the calendar is the deadline-radar framing — kept as its own pinned page, not a board toggle)
- **Monthly close** _(the routine per-month cycle)_ — **Unclosed** (open periods not yet closed) · **Closed** (closed periods). Under each, the individual months are **dynamic subpages** (a `[period]` route rendered per `accounting_period` at runtime — not static nav leaves).
- **Obligations** _(always-on pages — each obligation KIND has a stable navigable home; the dynamic per-period instances render inside it, opened from the cockpit)_
  - **VAT** _(vat_status-gated)_ — subpages: VAT return (DAP) · Control statement (kontrolní hlášení) · EC Sales List (souhrnné hlášení) · OSS · IOSS
  - **Payroll** _(has_employees-gated)_ — subpages: Monthly employer report (JMHZ) · Social insurance · Health insurance · Withholding tax
  - **Income tax** — subpages: Corporation tax (DPPO) · Section 7 tax-record worksheet (DPFO) · Advances
  - **Intrastat** _(activity-gated: intra-EU goods trade ≥ 15M CZK/flow/yr — statistical, no tax)_ — subpages: Dispatches (odeslání) · Arrivals (přijetí)
  - **Year-end** — subpages: Accruals · Provisions · Value adjustments · Deferred tax · Draft closing worksheet · Publication · Year close
- **Archive** — filed periods + výstupy (submitted DAP/KH/SH, závěrka, protocols/confirmations)

**Universal close flow** (the UVP loop — opened per obligation from the cockpit, not nav pages):
`Prepared` (agent narrative + source lineage) → `Checks` (blocking vs advisory; must be
green to advance — saldo reconciled · KH↔DAP cross-tie · VIES for ICD · inventarizace
resolved) → `Review & confirm` (line-level accept/override — the human approval gate,
AI-denied) → `File` (one action → submission + protocol → Archive; idempotent, 10y-audited, AI-denied).

Obligation kinds the flow covers _(regime / vat gated)_. **Each KIND is an always-on nav
page (the Obligations group above); the specific filings/steps below are its subpages, and
the dynamic per-period instances open from the cockpit inside them. All obligation outputs
are [mock — no v2 entity]: DPH filings are DERIVED (not modelled), and the závěrka / output
layer (`period_output`) is V2-DEFERRED.**

- **VAT** — DAP (monthly/quarterly; monthly mandatory if prior-year turnover ≥ 10M or first 12 months as payer, §99–99b) · **KH (always monthly, even if quarterly payer)** · SH · OSS (quarterly, EUR) · IOSS (monthly, EUR) · opravy odpočtené daně
- **Payroll** — **Vyúčtování daně ze závislé činnosti** (annual employer income-tax reconciliation to FÚ, 1 Mar, §38j) · **Vyúčtování srážkové daně** · JMHZ (2026 unified, 20th — confidence-flagged superset lane, §G1) + the verified legacy SP / ZP / withholding přehledy (which MUST stay)
- **Income tax** — DPPO / DPFO (deadlines 1 Apr / 1 May / 1 Jul) + **advances (zálohy)**
- **Intrastat** _(activity-gated, statistical — NOT a tax)_ — monthly declaration to **ČSÚ** via the **INTRASTAT-CZ portal** (Celní správa IT); Dispatches (odeslání) + Arrivals (přijetí) reported separately once **either flow crosses 15M CZK/yr**; due the **12th working day** after month-end; files to Directory › Institutions › **Customs**, feeds the cockpit board. Legal basis: §58 Act 242/2016 + NV 333/2021 (am. 442/2023) + Act 89/1995 (statistics), EU Reg 2019/2152. **Distinct from Souhrnné hlášení** (SH = tax evidence, 25th; Intrastat = physical goods movement incl. own-stock transfers / call-off)
- **Year-end** — opening balances · **časové rozlišení (38x)** (accruals/deferrals) + **dohadné účty (388/389)** (estimated items — explicit year-end step) · provisions (rezervy) · value adjustments (opravné položky) · FX revaluation _[no FX in MVP]_ · inventarizace (register in Assets) · deferred tax _(audit-required entities, §59 Decree 500/2002 — proxied by size MEDIUM/LARGE)_ · **závěrkové předkontace** (closing entries — distinct step before statements) · závěrka statements (rendered from Reports, frozen at confirm) · **approval (valná hromada, 30 Jun)** · audit (before publication) · zpráva o vztazích (koncern) · publication (sbírka listin) · **year close + period lock** (uzavření roku / **datová uzávěrka** — append-only enforcement: locked period is immutable, post-lock corrections only via a new opravná položka/storno posting)
- **OSVČ** — annual SP / ZP přehledy (~2 May) _(person_type = NATURAL, off on paušál)_

> **Period lock** is the structural backbone of the trust loop's File terminus: filing /
> year-close flips the period append-only (no in-place edits, 10y-audited). Surfaced as a
> Checks-gated action inside the relevant close flow, not a separate nav page.

> Cross-module: opravné položky — aging/register in **Finance**, recognition+posting+
> close-review here. Inventarizace — register in **Assets**, flow here. Statements —
> rendered in **Reports**, frozen-snapshot here. **Office-wide bulk close** (one VAT
> period across all clients) = a **workspace-tier** Close run (`/workspace`), the UVP's
> force-multiplier. Model: `period_output` (vystup) + books/statement VIEWS are
> DEFERRED in v2 → this module ships mock-backed until they land.

#### Reports (`/reports`) — analytical & statement outputs (agent-generated) — REVIEWED

Outputs/analytics — NOT live books (Accounting) nor filings (Closing).

- **Pinned: Overview** — reports hub + **agent insight** (anomalies / variance callouts on the numbers)
- **Statements** — _double-entry (účetní závěrka):_ Balance sheet (rozvaha) · Income statement (výsledovka; subpages: Statutory (VZZ) · **Monthly P&L** — výkaz hospodaření za měsíc) · Notes (příloha) · Cash flow · Equity changes. _cash regime (TODO(regime)):_ **Assets & liabilities list** (přehled o majetku a závazcích) · **Income & expenditure list** (přehled o příjmech a výdajích). _DPPO Ř.40 reconciliation is part of the income-tax close (Closing). Components adapt by size (mikro/malá abbreviated; CF + equity only střední/velká); published set (size+audit) distinct from internal full set. [CF/equity blocked on deferred output + FX]_
- **Analysis** _(snapshot/print versions; the live trial balance + analytical ledger live in Accounting › Books)_ — Account analysis · Trial balance (obratová předvaha) · Profitability (subpages: Summary (revenue · cost · profit) · **Cost & revenue listing**) · Management reporting (subpages: By cost centre · By job · By activity · **Job profitability**)
- **Balances** _(account-state report family — the printable/snapshot versions; Finance keeps the live working open-item ledger)_ — **Open items by partner** (saldo — open-item balance by counterparty) · **Account balances** (stav účtů) · **Account movements** (pohyby na účtech) · **Account verification** (inventarizace účtů) · **Receivables/payables at date** (stav záv. / pohl. ke dni)
- **Print exports** — Document journal (dokladový deník) · FX rate list (kurzovní lístek) _[mock — FX deferred in MVP posting]_ · Statutory prints (ad-hoc operator snapshot; subpages: Journal (deník) · General ledger (hlavní kniha) — live books in Accounting; the statutory závěrka snapshot frozen at filing lives in Closing › Archive) · **XML statement export** (Rozvaha + VZZ v XML — for filing/handoff) · **Audit confirmation letters** (ověřovací dopisy — balance-confirmation requests to partners)

> Same statement render component is used live here and frozen-at-confirm in Closing.
> DPH filings = Closing (not reports). The **working** aging / saldo (interactive, dunning-driving)
> = Finance; the **report** saldo/account-state family here is the snapshot/print version. Asset overview = Assets.

#### Directory (`/directory`) — all contacts & directories (workspace-shared) — REVIEWED

The hub for **every** directory — a real multi-page module (modeled on Abra's _Obchodní
partneři_ + Money's _Firmy_). **Pinned: Overview.** Group **Registers**:

- **Counterparties** (firmy / adresy firem) — companies; subpages: Customers (odběratelé) · Suppliers (dodavatelé). Card: identity · **bank accounts** (1:N, bankovní spojení) · **delivery locations** (místa určení) · **groups** (skupiny firem) · DIČ · **payment terms** (splatnost — default due-days · preferred payment method · per-partner **posting** předkontace · **dunning** profile) · **VIES/ARES/reliability + credit check** (nespolehlivý plátce, Cribis/Creditcheck-style) · **osoby blízké** flag (related-party detection → §23/7 transfer-pricing + zpráva o vztazích) · current-org-scoped documents & balances + link-outs (→ Records documents · → Finance saldo/dunning)
- **Contacts** (kontakty / osoby) — persons _[mock — no contact entity]_
- **Activities** (události, aktivity) — CRM interactions/events with partners (+ event costs) _[mock]_
- **Contracts** (smlouvy) — subpages: Customer (odběratelské) · Supplier (dodavatelské), with items/states/types _[mock]_
- **Institutions** — authorities you file to; subpages: **Tax office** (finanční úřad) · **Social security** (ČSSZ / OSSZ) · **Health insurers** (each zdravotní pojišťovna — VZP 111, ZPMV 211, ČPZP 205, OZP 207, VoZP 201, RBP 213) · **Customs** (celní úřad) · **Commercial register** (justice.cz — sbírka listin) · **Data box** (ISDS) — the 2026 single-collection-point set
- **Banks** (peněžní ústavy) — the bank-**institution** registry; a counterparty's own bank accounts are a card field (above), and the homebanking connection is Settings › Integrations
- Bulk ops (merge/dedupe/anonymize, change-group) = actions, not pages.

> The org's **self-identity** (`self_of_organization_id`) is edited in **Settings →
> Organization → Identity** (authoritative); read-only + non-deletable in the
> Counterparties tab (same `counterparty` table, RLS-protected). Counterparty is
> **workspace-shared** — editing affects every org in the office (shared-write warning);
> documents/balances panel is **scoped to the current org**. Reliability _enforcement_
> (warn before paying an unreliable plátce) → **Finance** payment orders.

#### Settings (`/settings`) — org-general config — REVIEWED

Org-wide config only; module-specific config lives in its module (chart/posting →
Accounting; bank/cash masters → Finance; asset types/locations → Assets; payroll
codebooks → HR). Law/reference tables shown **seeded read-only**.

- **Pinned: Overview**
- **Organisation** — Identity · Periods & fiscal year (regime · size · currency) · VAT status · Tax profile · Business activities · Branding (client logo on outputs)
- **Reference** — org choices + cross-cutting codebooks:
  - **Number series**
  - **FX rates** — subpages: Method (daily/fixed §24) · Central bank feed (ČNB rate-list)
  - **Dimensions** — subpages: Cost centres · Jobs · Activities
  - **Codebooks** — subpages: **Document types** (typy dokladů) · **Constant symbols** (konstantní symboly) · **Payment methods** (formy úhrady) · Units (MJ) · Tags
  - **Law tables** _(seeded read-only — browsable, not org-editable)_ — subpages: VAT rates · Depreciation groups (odpisové skupiny 1–6) · NACE codes (business_activity) · **Account groups** (účtové skupiny) · **Directive chart** (směrná účtová osnova / directive_account) · **Legal forms** · **Regimes** · **Size categories** (accounting_size) · Countries & postcodes
- **Access** — Members _(roles / permission catalog = workspace tier)_
- **Integrations** — Data box (ISDS) · Homebanking · ISDOC / iDoklad _(API keys, SMTP = workspace tier)_
- **System** — AI budget & cooldown · Reminders / scheduled reports · **Recurring tasks** (opakované úlohy) · **Background jobs** (agent-run / job history) · **Submission log** (odeslaná podání / data-box sent) · **Recycle bin** (smazané doklady) · **Action history** (audit trail — per-org) · **Print templates** (tiskové formuláře) · Import / Export _(backups = platform-operated)_
- **Debug** _(dev reference)_ — **Debug** landing · **Archetype Blank** (the Blank archetype reference page: ContentHeader without view tabs · no toolbar · one full-height Empty section · no footer) · **Archetype Details** (the Details archetype reference page: ContentHeader without view tabs · no toolbar · multiple stacked sections · a Save/Discard footer) · **Section Form** (the Form section reference page: two-column group — title + description left, a 6-column field grid right, fields spanning 1–6 columns)

> **Posting templates** (předkontace / předpisy zaúčtování — the 4th posting-automation codebook) live
> in **Accounting → Structure → Posting rules** (locked: module-specific config stays in its module);
> Document types / Constant symbols / Payment methods are org-general → here.

> The org index ("Company") has no module folder; its trivial tree is the inline
> `companyNav` in `org-nav.ts`.

---

## Cross-cutting agent surfaces & shared spine

The agent-native layer binding the 10 modules into one product, built on shell slots
that already exist (Assistant panel, sidebar Insight/Reminders, content status bar + Inspector).

### Assistant panel (the agent's home — first-class surface)

The shell's 3rd panel. **Context-aware** — shows what the agent knows/did about the open
record/period/module. Standard contents:

- **Activity narration** — "posted FP-2026-0142 → 518/321, confidence 0.97 (from the PDF)"
- **Pending escalations** for the current scope (confidence-gated `user_task` items)
- **Natural-language command line** — calls the SAME tool registry the UI buttons call
  ("pay overdue under 5,000 to reliable plátci", "post these 12 like last month")
- Deep-links INTO module pages (agent cites a document → click through)

### Shared-spine components (one source, embedded everywhere)

| Component                                                                                               | Authoritative home           | Embedded in                                            |
| ------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| Lineage rail — predecessor→successor, **crosses modules** (záloha→faktura→dobropis→úhrada→KH→statement) | shared                       | every Single (Records/Finance/Accounting/Closing)      |
| Counterparty card                                                                                       | Directory (workspace-shared) | read-only wherever a partner appears                   |
| Money cell (`Money<Currency>`, native+CZK on FX)                                                        | shared                       | every amount; `ContentStatusBar` for aggregates        |
| PeriodSwitcher                                                                                          | shell chrome                 | scopes every org page                                  |
| **Agent provenance strip** (agent/human · confidence · derived-from · předkontace)                      | shared                       | every Single detail                                    |
| Checks band (blocking vs advisory) — register source: Accounting › **Posting checks** (Kontroly)        | shared                       | Closing flow · posting · capture · bulk reconciliation |

Every module Overview hosts an agent-activity feed + anomalies; Company hosts the
org-level digest; Reports hosts insight/variance callouts; capture/posting **Review**
queues are confidence-sorted accept/override lists. Sidebar Insight + Reminders carry
per-module attention cards.

---

## Workspace surface (`/workspace/…`)

The accountant's office surface — global to the user, not scoped to one org.
✅ = exists today · ⬜ = planned (the agent-native + multi-tenant-office advantage).

| Page           | Path                   | Status | Purpose                                                                                                      |
| -------------- | ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Home           | `/workspace`           | ✅     | Office landing / org picker                                                                                  |
| Inbox          | `/workspace/inbox`     | ✅     | Cross-org work queue / `user_task` escalations                                                               |
| Close run      | `/workspace/close`     | ⬜     | Office-wide bulk close — one period kind across all client orgs at once (the Closing UVP's force-multiplier) |
| Deadlines      | `/workspace/deadlines` | ⬜     | One daňový kalendář across ALL clients — proactive deadline radar                                            |
| Agent activity | `/workspace/activity`  | ⬜     | Cross-client feed of what the agent did / needs                                                              |
| Counterparties | `/workspace/directory` | ⬜     | Workspace-shared registry (VIES/ARES/reliability captured once, reused per client)                           |
| Audit          | `/workspace/audit`     | ⬜     | Cross-org audit dashboard (`audit_event` is workspace-tier)                                                  |
| Profile        | `/workspace/profile`   | ✅     | User profile                                                                                                 |
| Billing        | `/workspace/billing`   | ✅     | Subscription / billing                                                                                       |
| Settings       | `/workspace/settings`  | ✅     | Workspace settings                                                                                           |

---

## Auth & onboarding flows

Flow surfaces (not part of the shell). Listed for completeness; they exist
today and follow the auth shell, not the org app shell.

| Flow       | Paths                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth       | `/auth/login` · `/login/password` · `/login/mfa` · `/signup` · `/forgot-password` · `/reset-password` · `/invite` · `/mfa/setup` · `/revalidate` |
| Onboarding | `/onboarding/workspace` · `/profile` · `/team` · `/plan` · `/experience` · `/password` · `/done`                                                 |

---

## Dev-only

| Page               | Path              | Status | Purpose                                                                                         |
| ------------------ | ----------------- | ------ | ----------------------------------------------------------------------------------------------- |
| Content panel demo | `/[orgSlug]/demo` | 🧪     | Saved `Table` archetype reference (invoices). 404 in production. Copy-from, not a shipped page. |

---

## Out of scope here

The **admin / staff back-office** (`apps/admin`) is a separate app on its own
gated shell with its own route tree (`/(gated)/…`). It is not part of this
org-app sitemap.

---

## Growing the map

1. Decide the page (and its archetype). Add a row to the relevant table here.
2. Scaffold it — [APP-SHELL-PANELS § Adding a page](../runbooks/APP-SHELL-PANELS.md#adding-a-page-subpage-module-or-tabs)
   (route folder + nav leaf + `pnpm check:nav`).
3. Build the body with the chosen archetype. For `Launchpad` / `Dashboard` /
   `Single`, use the prototypes from issue
   [#425](https://github.com/hlebtkachenko/monorepo/issues/425) until they are
   promoted to real composing components.
4. Flip the status (⬜ → 🟡 → ✅) and update the row's purpose.
