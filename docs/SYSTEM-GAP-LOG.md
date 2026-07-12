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

## GAP-005 — Login-pack safety sections have no canonical authored source

- **Status:** Open
- **Area:** brain-agent
- **Severity:** High
- **Type:** feat
- **Discovered:** 2026-07-12, first live HELD booking run

**Plain:** Every live Brain session must be handed four "safety framing" texts (the KB pointer, a law
summary, a confidence protocol, an escalation policy). There is no canonical, versioned source for
them — each operator hand-writes the Brain's law grounding per session, so two sessions can reason
against different, unversioned rules.

**Technical:** The login-pack assembler (`packages/brain/src/agent/assemble-sections.ts`) validates
that `kb.{id,version}`, `lawSummary`, `confidenceProtocol`, `escalationPolicy` are present and
non-blank and **fails closed** otherwise, but the authored homes for these are "README-only stubs,
empty at M0". The KB pointer is a runtime `{id, version}` with no backing snapshot store (no
`kb_snapshot` table). So the operator supplies free text; nothing pins or versions the grounding, and
`kb.id/version` reference nothing enforceable.

**Current workaround:** The operator supplies substantive-but-hand-authored sections per run (a CZ
accounting digest, the server-scores confidence note, a propose-only escalation policy) and a nominal
`kb` pointer.

**Proper fix:** Canonical, versioned section content (a real law-summary/confidence/escalation source
+ a KB snapshot store the `kb` pointer resolves against), loaded by the operator flow rather than
hand-typed each session.

---

## GAP-006 — `canUseTool` default-deny gate shadowed by `allowedTools` (observed live)

- **Status:** Open <!-- tracked as issue #578 -->
- **Area:** brain-agent
- **Severity:** Medium
- **Type:** fix
- **Discovered:** 2026-07-12, first live run emitted the SDK warning

**Plain:** The Brain sandbox is described as three independent layers. One of them (a per-call
permission callback) never actually runs, because bare tool names in the allow-list auto-approve the
whole tool before the callback is consulted. Not a live hole today, but the "3 layers" claim is really
2.

**Technical:** A live run emits `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` — "bare `allowedTools` entries
auto-approve the whole tool before the callback is consulted" — so `canUseTool` is not invoked for the
allow-listed MCP tools. The server gate + the allow-list still hold, so no tool escapes, but the
default-deny `canUseTool` layer is inert. Already tracked as issue #578.

**Current workaround:** None needed for safety (server gate + allow-list hold); accept 2 effective
layers.

**Proper fix:** Per #578 — gate every tool call via a PreToolUse hook, or drop the bare names from
`allowedTools` so they fall through to `canUseTool`.

---

## GAP-007 — Single-shot run books a capture only; the Brain's account předkontace is untested

- **Status:** Open
- **Area:** brain-intake / accounting-capture
- **Severity:** High
- **Type:** feat
- **Discovered:** 2026-07-12, scoring the first live batch against a real book

**Plain:** Running one invoice through the Brain produces a *document capture* (the VAT breakdown) but
**not the double-entry booking** (which cost account, e.g. `501` material vs `518` services, against
`321`). Worse, the capture's VAT numbers are taken straight from the operator-supplied import, not
reasoned by the Brain. So a batch of held captures proves the plumbing + import fidelity + the
held-at-cold-start posture, but does **not** test the Brain's core booking intelligence (the account
předkontace) against the real book.

**Technical:** `packages/intake/src/ir-to-capture.ts` maps the IR to the capture **deterministically**
— `baseAmount`/`vatAmount` come STRAIGHT from the source (`base_minor`/`tax_minor`), and `vatMode`
/`vatJurisdiction` are hard-coded `STANDARD`/`DOMESTIC` defaults (the Brain's `classify` threading can
only narrow them, never widen). `packages/accounting/src/capture.ts` is explicitly "pre-posting — no
posting yet (§33/5); posting is UC-1 step 4". The account choice lives in `classify`'s `PostingDecision`
(`EXPENSE_ACCOUNT[supplyKind]` + saldo `311/321`), but `classify` is a pure endpoint that logs nothing,
and `create_accounting_posting` requires a **pre-existing `accounting_event`** (`eventId` FK — the
2-stage flow of GAP-002). So the Brain's decision is not surfaced in any scoreable artifact.

**Current workaround:** Score at capture / VAT-treatment level only (amounts reconcile vs the book);
account-level předkontace is not yet compared.

**Proper fix:** A full-booking harness mode where the Brain freely reasons the invoice and proposes
event + capture + posting (with the předkontace accounts) as gated HELD writes, so the posting's
`debit`/`credit` accounts can be scored against the real účetní deník. Resolve the eventId 2-stage
dependency (GAP-002) as part of it.

---
