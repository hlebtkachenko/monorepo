# System Gap Log

A running, append-only log of **gaps** found while operating the system: missing pages, unwired
filters/sorting, backend data not connected, mechanisms we hard-coded or worked around because the
"proper" path isn't built yet, protocol rough edges, operational friction. Each entry is written so it
can be **escalated to a GitHub issue verbatim** later.

The companion **[`SYSTEM-GAP-LOG-INDEX.md`](SYSTEM-GAP-LOG-INDEX.md)** is a one-line-per-gap table —
read it first to find a number, then read the full entry here. The index is **generated**; never edit
it by hand.

> **This file is committed to the public remote.** It MUST stay clean of secrets and
> personal/customer/demo data — see the hygiene rules below. A CI-friendly guard
> (`scripts/gap-log/reindex.mjs`) refuses to run if it detects an obvious leak.

---

## How to add a gap (the workflow)

1. **Append** a new entry to the bottom of the "## Gaps" section using the template below. Take the
   next free `GAP-NNN` number (zero-padded to 3). Never renumber or delete an existing entry — mark it
   `Resolved` / `Won't-fix` instead.
2. Fill **both** a plain-language explanation and the technical detail. More context = a better future
   issue. Reference files/functions by path, not by pasting large code.
3. Run the reindexer to sync the index + run the leak guard:
   ```bash
   node scripts/gap-log/reindex.mjs
   ```
   It regenerates `SYSTEM-GAP-LOG-INDEX.md` from the headers here and **exits non-zero** if it finds a
   forbidden pattern (API keys, tokens, private keys, emails). Fix any leak before committing.
4. Commit both files together (`docs(gap-log): GAP-NNN <title>`).
5. **To escalate** a gap to GitHub later: the entry is already issue-shaped — copy the body, set
   `Type`/`Priority`/`Area` from the entry's fields, then update the entry's `Status` to
   `Escalated (#NNN)`.

### Hygiene rules (public remote — non-negotiable)

- **No secrets:** API keys (`affk_*`), tokens (`sk-ant-*`, `ghp_*`, `github_pat_*`), passwords,
  private keys. The guard blocks these.
- **No personal / customer / demo data:** real names, emails, IČO/DIČ, org slugs, org display names,
  document numbers, amounts, addresses. Describe the system **generically** ("the received-invoice
  page", not "org X's invoice 251100005").
- **Generic reproduction only:** describe the class of input ("a structured export folder", "a
  cold-started org"), never the specific tenant.

### Entry template

```markdown
## GAP-NNN — <short imperative title>

- **Status:** Open <!-- Open | Escalated (#NNN) | Resolved (#NNN) | Won't-fix -->
- **Area:** <subsystem, e.g. brain-intake · accounting-capture · app-web · api · ops/infra>
- **Severity:** Medium <!-- Blocker | High | Medium | Low -->
- **Type:** feat <!-- feat | fix | refactor | chore | docs | infra -->
- **Discovered:** YYYY-MM-DD, <sanitized context, e.g. "first live HELD booking run">

**Plain:** <1-3 sentences a non-engineer understands — what is missing or wrong.>

**Technical:** <the precise mechanism; file/function references; what is hard-coded or bypassed.>

**Current workaround:** <what we do now to get past it.>

**Proper fix:** <what the real mechanism should be.>

---
```

---

## Gaps

## GAP-001 — Ingest native accounting-software backups (Pohoda `.mdb`, Money `.FRM`)

- **Status:** Open
- **Area:** brain-intake
- **Severity:** High
- **Type:** feat
- **Discovered:** 2026-07-12, preparing a supervised booking run from a real accounting export

**Plain:** The Brain's structured-import path can read data-exchange XML, CSV and XLSX, but it cannot
read a raw backup produced by common Czech accounting software. An operator holding only a native
backup has to convert it outside the product before anything can be booked.

**Technical:** The folder-walk importer parses data-exchange XML / CSV / XLSX into IR
(`packages/intake/src/{pohoda,csv,xlsx}.ts`); the Pohoda parser explicitly **refuses a native backup**
("a native backup (not dataPack XML) is refused with a warning — never parsed"). There is no importer
for a native Pohoda backup (a ZIP of an Access `.mdb`, or the `.lz`/`.FRM` family) nor for a Money-family
proprietary backup. So the only accepted structured inputs are re-exported formats, not the backup the
operator actually has.

**Current workaround:** Convert the backup externally into IR-shaped inputs (read the Access `.mdb` with
`mdbtools`, or have the operator re-export the source agendas as data-exchange XML) before running the
importer.

**Proper fix:** A first-class backup importer (at least: ZIP-of-Access-`.mdb` for Pohoda) that maps the
document agendas to IR, or an in-product "import from backup" flow, so an operator never has to
hand-convert.

---

## GAP-002 — A fresh document→booking needs a separate, pre-approved accounting event

- **Status:** Open
- **Area:** accounting-capture
- **Severity:** Medium
- **Type:** feat
- **Discovered:** 2026-07-12, planning the first live HELD booking

**Plain:** Booking one document isn't a single action. The posting lines must attach to an
"accounting event" that has to already exist and be human-approved first — so a single invoice becomes
a two-stage approval instead of one smooth capture.

**Technical:** A captured document's posting line references `accounting_event_id` as a **foreign key**
(`packages/accounting/src/capture.ts`, the `individual_record` insert). `captureDocument` never creates
the event; the event comes from the separate gated `createEvent` path (proposed → HELD → human
approves → returns the real id), which the capture must then reference. While a write is HELD the FK is
not dereferenced (a placeholder id still returns `202 held`), but at **approve** time a non-existent id
fails the FK and rolls back — so a placeholder passes the "does it hold?" check yet cannot be approved.

**Current workaround:** Run the gated `createEvent → approve` first and thread the returned event id
into the capture; or seed one real event out-of-band and reuse its id for the run.

**Proper fix:** A one-shot "book this document" flow that proposes the event + its postings together as
one reviewable unit (single human approval), instead of two chained gated writes.

---

## GAP-003 — No keep-warm for a live operator session (prod idle-auto-sleeps)

- **Status:** Open
- **Area:** ops/infra
- **Severity:** Medium
- **Type:** infra
- **Discovered:** 2026-07-12, driving a live session against the deployed API

**Plain:** The environment goes to sleep when idle to save money, and there's no way to keep it awake
for the length of a working session. During a live session it can drop mid-flow and every request has
to wait for a cold resume.

**Technical:** Power is manual only (a resume/pause workflow); there is no scheduled or
session-scoped "hold warm" mechanism. An idle environment cold-pauses (Fargate + RDS stopped), and a
resume takes minutes (RDS start). A live operator loop therefore needs a manual resume plus an
external heartbeat (repeated health pings) to prevent re-sleep, which is fragile and easy to forget.

**Current workaround:** Manually resume, then run an external keep-alive loop that pings health for the
session window; re-arm it when it expires.

**Proper fix:** A "keep warm until HH:MM" / session-lease affordance on the power control (or an
activity-based auto-extend), so a live session holds the env warm without an ad-hoc external pinger.

---

## GAP-004 — Verify the received-invoice review surface is wired (data + filters + sort)

- **Status:** Open
- **Area:** app-web
- **Severity:** Medium
- **Type:** fix
- **Discovered:** 2026-07-12, reviewing where a booked/held received invoice would surface

**Plain:** There's a received-invoices page in the org app, but it's unconfirmed whether it lists the
real captured/held documents, and whether its sorting and filters are connected to live data or are
still placeholder scaffolding.

**Technical:** A received-invoices document page exists
(`apps/web/app/[orgSlug]/documents/invoices/received/page.tsx`), alongside the generic accounting
approvals queue (`apps/web/app/[orgSlug]/accounting/approvals/page.tsx`). To verify: does the received
page query real captured documents for the org, are its filter/sort controls bound to the backend, and
is it distinct-but-consistent with the approvals queue — or is any of it mock/unwired (a known pattern
from the scaffold-first build)?

**Current workaround:** Use the accounting approvals queue as the review surface for held writes.

**Proper fix:** Confirm (or wire) the received-invoice page to real captured-document data with working
server-driven filter + sort; if it is intentionally distinct from the approvals queue, document the
split.

---
