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
   (indented, no icon, **max 2 deep**). Don't exceed it; a deeper tree means the
   module wants splitting.
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

The ten rail modules. **Every module currently ships only an `Overview` leaf
with a `ModulePage` placeholder body** — the real pages per module are filled in
below as they are agreed. Rail order, icons, and the label↔folder mapping are
fixed in `_nav/org-nav.ts`.

| Rail label | Route segment (folder) | `MODULE_NAV` key | Rail icon             | Status           |
| ---------- | ---------------------- | ---------------- | --------------------- | ---------------- |
| Company    | `/[orgSlug]` (index)   | `""`             | `Goal`                | 🟡 Overview only |
| Accounting | `accounting`           | `accounting`     | `Calculator`          | 🟡 Overview only |
| Records    | `documents`            | `documents`      | `FolderBookmark`      | 🟡 Overview only |
| Finance    | `finance`              | `finance`        | `ReceiptEuro`         | 🟡 Overview only |
| HR         | `hr`                   | `hr`             | `Users`               | 🟡 Overview only |
| Assets     | `assets`               | `assets`         | `BriefcaseBusiness`   | 🟡 Overview only |
| Closing    | `closing`              | `closing`        | `CalendarClock`       | 🟡 Overview only |
| Reports    | `reports`              | `reports`        | `ChartNoAxesCombined` | 🟡 Overview only |
| Directory  | `directory`            | `directory`      | `BookUser`            | 🟡 Overview only |
| Settings   | `settings`             | `settings`       | `Settings`            | 🟡 Overview only |

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

#### Company (`/`) — LOCKED

- **Pinned:** Overview · Inbox (org-filtered link → `/workspace/inbox`) · Tasks
- **Profile** — Company card · Members
- **Engagement** — Services (add-ons we provide to _this_ company, not workspace) · Onboarding

> **Overview = the org digest** (content, not new pages): an **obligations mini-cockpit**
> (next deadlines across VAT / payroll / income-tax / close, deep-linking into Closing) +
> the org-level **agent-activity feed** + an **anomalies pin** (the agent's flagged
> variance/exceptions for this org). The cross-client versions live in `/workspace`.

#### Accounting (`/accounting`) — the books (regime-aware) — REVIEWED

- **Pinned:** Overview (books vitals: period posting status · open-item & analytical↔synthetic reconciliation) · **Review** (work queue: unposted + low-confidence agent postings + this-org exceptions; cross-client queue lives in `/workspace/inbox`)
- **Books** _(regime-aware)_ — the statutory **účetní knihy** (563/1991 §13)
  - _double-entry:_ Journal (deník) · General ledger (hlavní kniha; **Off-balance** = the statutory 4th book _kniha podrozvahová_ §13 — guarantees / leased-custody / off-balance items — shown as a GL tab) · Analytical ledger (knihy analytické evidence) · Trial balance (obratová předvaha)
  - _cash regime:_ Cash journal (peněžní deník)
- **Structure** _(regime-aware)_
  - _double-entry:_ Chart of accounts (účtový rozvrh) · Posting rules (předkontace — agent posting config, no statutory book)
  - _cash regime:_ Categories (income/expense — replaces the chart)
  - **Posting checks** (Kontroly) — rule-based posting-validation register (balanced MD/Dal · valid account/regime · DUZP-in-period · saldo-tie); **distinct from the Review work queue** (Review = agent-output triage; Checks = deterministic rule results). Feeds the shared Checks band.
  - **Opening balances** (počáteční stavy / period init — _inicializace období_) — entry of opening account/saldo/VAT balances when a period or migration starts
- **VAT ledger** — 343 evidence _(gated on vat_status)_ — tabs: **Input** (vstup / odpočet) · **Output** (výstup / daň na výstupu) · **Reverse-charge / PDP** (přenesená daňová povinnost §92a–92h — supplier A1 / buyer B1) · **Členění DPH** (VAT breakdown by rate / section)
- _Number series → Settings (org-general, spans all entity types). DPH filings → Closing._

#### Records (`/documents`) — all documents, "what's on paper" — REVIEWED

- **Pinned:** Overview (recently captured · to-review · capture exceptions) · **Inbox** (capture intake — uploads / e-mail / data-box / ISDOC land here; agent OCRs + proposes a voucher; "to classify" queue)
- **Invoices & vouchers**
  - **Invoices** — tabs: Received (faktury přijaté) · Issued (faktury vydané). Named subtypes via the lineage chain: ordinary _faktura_ (neplátce / IO, no DPH) · _daňový doklad_ (plátce ≥ 10,001) · _zjednodušený daňový doklad_ (≤ 10,000) · _souhrnný daňový doklad_ (§26 — multiple supplies to one buyer in a period)
  - **Advances** — zálohové faktury / proformas + **daňový doklad k přijaté záloze** (advance tax document, §26/§20; drives the advance→invoice→settlement lineage) — tabs: Received · Issued
  - **Credit & debit notes** — opravné daňové doklady: **dobropis** (credit) / **vrubopis** (debit), referencing the original (§45) — tabs: Received · Issued
  - **Obligation documents** — non-invoice payable/receivable vouchers (ostatní závazky/pohledávky); the _paper_ — balances live in Finance
- **Other documents**
  - **Loan documents** — úvěrové doklady (the paperwork; loan money movements → Finance) _[mock — no model entity yet]_
  - **Internal documents** — interní doklady (accruals · depreciation · self-assessment · corrections). Named subtype: **customs / JSD** (jednotný správní doklad — drives the import-VAT line, §235/2004)
- **Recurring templates** — periodická fakturace + recurring/periodic document templates (agent issues on schedule; human reviews the batch) _[mock — no model entity yet]_
- _Bank/cash documents → Finance. Tax-application (uplatnění daně) → Closing/DPH. Single detail = standard: header/lines + lineage rail + action set._

#### Finance (`/finance`) — cash-flow, "real money" — REVIEWED

- **Pinned:** Overview (cash position + cash-flow forecast · what needs action)
- **Treasury** — Bank (tabs: movements · statements · reconciliation) · Cash (pokladna) · Loans (tabs: movements · **statements** (úvěrové výpisy); documents in Records)
- **Receivables & payables** _(balances from real payments; also the mandatory cash-regime AR/AP registers)_ — Receivables (overdue · aging · dunning · **Debtors** (dlužníci — by-partner lens)) · Payables (due · to pay · **Creditors** (věřitelé — by-partner lens))
- **Collections** _(payment control — kontrola úhrad)_ — **Dunning** (upomínky — agent-prepared reminder letters by aging stage) · **Penalization** (penále — statutory/contractual late-payment interest calc)
- **Payments** — Payment orders (příkazy k úhradě; reliability check warns before paying an unreliable plátce) · Settlements (zápočty — clearing/netting, no cash movement; subtypes: vzájemný / vícestranný) · **Bulk reconciliation** (hromadné párování — auto-match cockpit: bank movements ↔ open AR/AP, agent-proposed, human-confirmed) · **Calculators** (tabs: FX (kurzová) · penalty (penále) · cash denomination (výčetka platidel))

> **Cross-module dependencies** (stated, not pages here): Counterparties =
> **Directory** (workspace-shared, referenced by every invoice/AR/AP). Number
> series = **Settings**. DPH filings + uplatnění daně = **Closing**.
> Statements / saldo reports = **Reports**.

#### HR (`/hr`) — people & payroll — REVIEWED _[mock — no v2 payroll entity yet]_

Mined from Money _Režie_ (Mzdy + Jízdy) + Abra _Personalistika_.

- **Pinned:** Overview (payroll status · filings due) · **Review** (payroll-run approval · exceptions)
- **People** — Employees (zaměstnanci; card tabs: pracovní poměry · prohlášení poplatníka [per tax-year] · slevy/zvýhodnění · **Srážky** (deductions — exekuce / insolvence / spoření) · **Personnel docs** (osobní dokumenty)) · Agreements (DPP / DPC)
- **Payroll** — Payroll runs (mzdy + payslips) · Payroll posting (zaúčtování mezd/záloh → payment orders) · Attendance (docházka / nepřítomnosti) · eNeschopenky / eDávky (ČSSZ) · Payroll reports (tabs: **Vyúčtování daně ze závislé činnosti** (§38j) · **Vyúčtování srážkové daně** · zdravotní · sociální [incl. **Výkaz DPP**] · daňové · náhrady nemoc) · **Payroll sheets** (mzdové listy — per-employee annual statutory register, §38j) · **ELDP** (evidenční listy důchodového pojištění → ČSSZ)
- **Vehicles** (Jízdy) — Vehicles (vozidla) · Trip log (kniha jízd) · Drivers (řidiči) _[mock]_

> **2026 reforms kept (do NOT drop despite stale KB):** **JMHZ** (Jednotné měsíční
> hlášení zaměstnavatele — unified monthly employer report replacing separate
> SP/ZP/withholding přehledy) + single collection point → runs in **Closing**
> (payroll lane, 20th), reporting to **Institutions** (Directory).
> Reference/config → **Settings**: nastavení mezd (legislativa · způsoby zaúčtování ·
> svátky) · mzdové složky · typ pracovního poměru · skupiny osob · cestovní náhrady.
> Gates: People/Payroll on `has_employees`; OSVČ own-contributions → Closing
> (`person_type = NATURAL`, none on paušál). Payroll computed → posting → **Accounting**.

#### Assets (`/assets`) — fixed assets & inventory (regime-aware) — REVIEWED

Mined from Money _Majetek_ (+ karta majetku) + Abra _Majetek_ + Evala.

- **Pinned:** Overview (depreciation due · inventory due · exceptions) · **Review** (to-commission · disposals · exceptions)
- **Register** — Fixed assets (dlouhodobý — DNM 01x + DHM 02x + land/art 03x) · Small assets (drobný majetek) · Acquisitions & disposals (pořízení / vyřazení — lifecycle; tabs: **WIP / pořízení** (04x — not yet commissioned) · **Advances** (poskytnuté zálohy na DM 05x) · Disposals (vyřazení)) · **Leasing** _[mock — no lease entity]_ (types: finanční / operativní / zpětný; the 3 posting flows — _zaúčtování splátek_ · _zaúčtování leasingového majetku_ · technical-improvement on leased asset 029)
- **Operations** — **Depreciation run** (zaúčtování majetku — agent posts účetní odpisy MD 551 / D 08x for the period; human confirms) · **Inventory count** (inventarizace — `inventory_count` + lines; manko 549 / přebytek 648)
- Asset card = header + tabs: **Movements** (pohyby) · **Účetní odpisy** · **Daňové odpisy** · **Assigned** (přiřazené) · Location (umístění) · Notes. Card events: **Technical improvement** (technické zhodnocení → 029, raises cost basis). Fields: acquisition/disposal method · odpisová skupina (1–6) · depreciation method (účetní; daňové method is **irrevocable** once chosen, §30/2) · primary accounts (majetku / oprávky / odpisů) · středisko / zakázka. _(regime-aware: cash → evidence majetku, daňové-only)_

> Cross-module: inventarizace _flow_ + deferred-tax (`accounting_size ∈ MEDIUM/LARGE`)
> → **Closing** (the register lives here). Reference/config → **Settings**: asset types
> (typy majetků) · locations (umístění) · depreciation groups (odpisové skupiny).
> Financial assets (06x) out of MVP. Off-balance/leased-custody = Accounting GL tab.
> (Vehicles → HR · Jízdy.)

#### Closing (`/closing`) — unified period-close cockpit (THE UVP) — REVIEWED

Close ANY period (month/quarter/year × VAT · income-tax · payroll · accounting) from
ONE place. Agent prepares; human reviews → confirms → **files** (only the human can
file — AI-denied). No competitor unifies this.

- **Pinned: Overview** — the cockpit: board (⇄ Calendar view) of every open obligation
  for THIS org, **regime-derived** (no VAT lane for neplátce; DPFO not DPPO for FO;
  přehledy not závěrka for jednoduché; OSVČ-contributions lane for OSVČ). Each row =
  status · deadline · amount; deep-links into that period's flow. Filter/lens by kind.
- **Pinned: Calendar** — daňový kalendář (time view of the same obligations)
- **Archive** — filed periods + výstupy (submitted DAP/KH/SH, závěrka, protocols/confirmations)

**Universal close flow** (the UVP loop — opened per obligation from the cockpit, not nav pages):
`Prepared` (agent narrative + source lineage) → `Checks` (blocking vs advisory; must be
green to advance — saldo reconciled · KH↔DAP cross-tie · VIES for ICD · inventarizace
resolved) → `Review & confirm` (line-level accept/override — the human approval gate,
AI-denied) → `File` (one action → submission + protocol → Archive; idempotent, 10y-audited, AI-denied).

Obligation kinds the flow covers _(regime / vat gated)_:

- **VAT** — DAP (monthly/quarterly) · **KH (always monthly, even if quarterly payer)** · SH · OSS (quarterly, EUR) · IOSS (monthly, EUR) · opravy odpočtené daně
- **Payroll** — JMHZ (2026 unified, 20th) + legacy SP / ZP / withholding přehledy
- **Income tax** — DPPO / DPFO (deadlines 1 Apr / 1 May / 1 Jul) + **advances (zálohy)**
- **Year-end** — opening balances · **časové rozlišení (38x)** (accruals/deferrals) + **dohadné účty (388/389)** (estimated items — explicit year-end step) · provisions (rezervy) · value adjustments (opravné položky) · FX revaluation _[no FX in MVP]_ · inventarizace (register in Assets) · deferred tax _(střední/velká)_ · **závěrkové předkontace** (closing entries — distinct step before statements) · závěrka statements (rendered from Reports, frozen at confirm) · **approval (valná hromada, 30 Jun)** · audit (before publication) · zpráva o vztazích (koncern) · publication (sbírka listin) · **year close + period lock** (uzavření roku / **datová uzávěrka** — append-only enforcement: locked period is immutable, post-lock corrections only via a new opravná položka/storno posting)
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
- **Statements** (účetní závěrka) — Balance sheet (rozvaha) · Income statement (výsledovka; tab: **monthly P&L** — výkaz hospodaření za měsíc) · Notes (příloha) · Cash flow · Equity changes · DPPO tax-base / deferred-tax reconciliation (Ř.40). _Components adapt by size (mikro/malá abbreviated; CF + equity only střední/velká); published set (size+audit) distinct from internal full set. [CF/equity blocked on deferred output + FX]_
- **Analysis** — Account analysis (analýza účtů) · Trial balance (obratová předvaha) · Profitability (výnosy · náklady · zisk; tab: **soupis nákladů a výnosů**) · Controlling (by středisko · zakázka · činnost; tab: **job evaluation** — vyhodnocení zakázek)
- **Balances** _(account-state report family — the printable/snapshot versions; Finance keeps the live working saldo)_ — **Saldo per partner** (open-item balance by counterparty) · **Account balances** (stav účtů) · **Account movements** (pohyby na účtech) · **Account inventory** (inventarizace účtů) · **Receivables/payables at date** (stav záv. / pohl. ke dni)
- **Print exports** — Document journal (dokladový deník) · FX rate list (kurzovní lístek) · Statutory prints (frozen period-snapshot of deník / hlavní kniha; live books in Accounting) · **XML statement export** (Rozvaha + VZZ v XML — for filing/handoff) · **Audit confirmation letters** (ověřovací dopisy — balance-confirmation requests to partners)

> Same statement render component is used live here and frozen-at-confirm in Closing.
> DPH filings = Closing (not reports). The **working** aging / saldo (interactive, dunning-driving)
> = Finance; the **report** saldo/account-state family here is the snapshot/print version. Asset overview = Assets.

#### Directory (`/directory`) — all contacts & directories (workspace-shared) — REVIEWED

The hub for **every** directory — **one page, tabs** (modeled on Abra's _Obchodní
partneři_ + Money's _Firmy_, which fit us well):

- **Counterparties** (firmy / adresy firem) — companies. Card: identity · **bank accounts** (1:N, bankovní spojení) · **delivery locations** (místa určení) · **groups** (skupiny firem) · DIČ · **payment terms** (splatnost — default due-days · preferred payment method · per-partner **posting** předkontace · **dunning** profile) · **VIES/ARES/reliability + credit check** (nespolehlivý plátce, Cribis/Creditcheck-style) · **osoby blízké** flag (related-party detection → §23/7 transfer-pricing + zpráva o vztazích) · current-org-scoped documents & balances + link-outs (→ Records documents · → Finance saldo/dunning)
- **Contacts** (kontakty / osoby) — persons _[mock — no contact entity]_
- **Activities** (události, aktivity) — CRM interactions/events with partners (+ event costs) _[mock]_
- **Contracts** (smlouvy) — Customer (odběratelské) + Supplier (dodavatelské), with items/states/types _[mock]_
- **Institutions** — úřady you file to, enumerated: **Finanční úřad** (per local FÚ) · **ČSSZ / OSSZ** · each **zdravotní pojišťovna** (VZP 111, ZPMV 211, ČPZP 205, OZP 207, VoZP 201, RBP 213) · **celní úřad** (customs / JSD) · **justice.cz** (sbírka listin) · **datová schránka** (ISDS) targets — the 2026 single-collection-point "instituce" set
- **Banks** (peněžní ústavy)
- Bulk ops (merge/dedupe/anonymize, change-group) = actions, not tabs.

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
- **Organization** — Identity · Periods & fiscal year (regime · size · currency) · VAT status · Business activities · Branding (client logo on outputs)
- **Reference** — org choices + cross-cutting codebooks: Number series · FX rates (method denní/pevný §24 + **ČNB rate-list feed**) · Tags · Dimensions (cost centers · jobs · činnosti) · Units (MJ) · **Document types** (typy dokladů) · **Constant symbols** (konstantní symboly) · **Payment methods** (formy úhrady) · **Law tables** _(seeded read-only — browsable, not org-editable; tabs: VAT rates · depreciation groups (odpisové skupiny 1–6) · CZ-NACE (business_activity) · **account groups** (účtové skupiny) · **directive chart** (směrná účtová osnova / directive_account) · **legal forms** · **regimes** · **size categories** (accounting_size) · countries / PSČ)_
- **Access** — Members _(roles / permission catalog = workspace tier)_
- **Integrations** — Data box (ISDS) · Homebanking · ISDOC / iDoklad _(API keys, SMTP = workspace tier)_
- **System** — AI budget & cooldown · Reminders / scheduled reports · **Recurring tasks** (opakované úlohy) · **Background jobs** (agent-run / job history) · **Submission log** (odeslaná podání / data-box sent) · **Recycle bin** (smazané doklady) · **Action history** (audit trail — per-org) · **Print templates** (tiskové formuláře) · Import / Export _(backups = platform-operated)_

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

| Component                                                                                               | Authoritative home           | Embedded in                                       |
| ------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------- |
| Lineage rail — predecessor→successor, **crosses modules** (záloha→faktura→dobropis→úhrada→KH→statement) | shared                       | every Single (Records/Finance/Accounting/Closing) |
| Counterparty card                                                                                       | Directory (workspace-shared) | read-only wherever a partner appears              |
| Money cell (`Money<Currency>`, native+CZK on FX)                                                        | shared                       | every amount; `ContentStatusBar` for aggregates   |
| PeriodSwitcher                                                                                          | shell chrome                 | scopes every org page                             |
| **Agent provenance strip** (agent/human · confidence · derived-from · předkontace)                      | shared                       | every Single detail                               |
| Checks band (blocking vs advisory)                                                                      | shared                       | Closing flow · posting · capture                  |

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
| Outbox             | `/dev/outbox`     | 🧪     | Dev mail outbox viewer                                                                          |

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
