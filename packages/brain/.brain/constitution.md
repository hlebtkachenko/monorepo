# Afframe Brain — Constitution (LOCKED)

> **LOCKED. Human-only.** No agent, subagent, or librarian may edit this file. Changes land only by a
> human commit, advisor-gated (≥2 independent Opus-xhigh). These invariants hold on a **prod
> multi-tenant book**; every claim is verified against the repo + #445 (+#462 held-writes), the landed
> accounting surface, not assumed. They are enforced as **executable checks**
> (`scripts/brain-build/constitution-checks/`, BGTG check #4) — this is a test that fails, not a doc an
> advisor skims.

The cardinal rule under everything below: **never raise the confident-wrong rate** (§I8).

## I1 — Server-side `withOrganization`; the Brain client cannot forge a tenant

v1 the Brain is an UNPRIVILEGED HTTP/MCP client of the accounting API. It holds NO DB creds, opens no
transaction, and NEVER calls `withOrganization` in-process. Every write goes to the accounting write
endpoint (`POST /v1/accounting/{events,documents,postings}`), which resolves the tenant from the
**API-key principal** (`ApiKeyPrincipal.organizationId` / `.workspaceId` / `.userId`) and runs
`withOrganization(principal.organizationId, principal.userId, fn)` (`packages/db/src/tenancy.ts`)
**server-side**, inside `runGatedWrite` (`apps/api/src/v1/accounting/accounting-writes.gate.ts`). The
org is a property of the credential, not a field of the request: it NEVER travels from the agent's
reasoning into a tool input (this is I3, enforced at the request-schema boundary). No accounting write
reaches the DB by any other path — a client structurally cannot forge a green booking or a cross-tenant
write. The org/user/workspace are stripped from every write body by construction (the controller reads
them only from `@CurrentPrincipal()`; the Zod request schemas do not declare them). Held-write RESOLVE
and the approve-replay path run the SAME server-side `withOrganization`.

## I2 — NEVER `withAdminBypass` on agent writes

`withAdminBypass` (`tenancy.ts:340`) opens a BYPASSRLS `app_admin` transaction. The runtime `app_user`
role **can assume** `app_admin` (`GRANT app_admin TO app_user`, migration `0002_auth.sql`) — so the
boundary is **execution context, not credentials**. The single legitimate BYPASSRLS need (the
closed-period compensating-entry rollback) runs **only** in `brain-control.yml` under the
`brain-production` environment with Hleb as required reviewer — **never** inside the Brain's job /
request path. `withAdminBypass` must not appear anywhere under `packages/brain/src/`.

## I3 — No tenancy fields in any tool/function input

No `organization_id`, `user_id`, `workspace_id`, or `role` in any exported tool/function input type.
The enforcement surface is the **API request-schema / MCP-tool-schema**: the Zod request schemas
accept **domain fields only** and do not declare a tenancy field, and tenancy is injected
**server-side** from the API-key principal (`@CurrentPrincipal()`), never from the request body.
(CLAUDE.md hard rule; verified pattern in the accounting write controllers + the endpoint-addition
runbook.) I1 ties to this invariant: the org being a property of the credential, not an input, is what
makes the client structurally unable to forge a tenant.

## I4 — The `tool_call_log` row + `conversation_id` is the rollback unit (no per-row `brain_run_id` column)

There is **no** per-row `brain_run_id` column on the landed accounting schema. The rollback UNIT is the
`tool_call_log` row plus its `conversation_id` (`packages/db/src/schema/tool_call_log.ts`): every gated
write inserts one `tool_call_log` row inside the SAME `withOrganization` tx as the domain write
(`writeToolCallLog`), carrying `conversation_id` (the run-correlation id), `input_json`, `output_json`
(incl. the applied entity ids). A "run" is all `tool_call_log` rows sharing a `conversation_id`
(org-scoped, under FORCE RLS). Per-run rollback keys off `conversation_id` and is applied as a
**compensating correction, never a physical delete**: a `posting` is append-only, so it is undone by a
NEW correcting posting (`corrects_posting_id`, R8 ČÚS 001 §35); a mutable document in a closed period is
corrected by a compensating entry (law-as-reference from the KB, never hardcoded); the `tool_call_log`
row itself is append-only (migration 0004: DELETE blocked, only `output_json`/`auto_applied`/
`approved_by_user_id`/`rationale` updatable). Per-run storno of a whole `conversation_id` is a
**documented FUTURE capability, not built now**; what exists today is the correlation spine
(`conversation_id`) + the append-only audit that makes such a rollback derivable.

## I5 — The API request-schema boundary is PRIMARY; the DB protects almost nothing at the document layer

There is NO in-process function boundary for the client. The PRIMARY correctness/immutability boundary is
the API request-schema / MCP-tool-schema boundary + the server-side gate (`runGatedWrite`: the three-way
AND of client-confidence, the server VETO, and the server SCORE) + the verifier/HITL + per-run rollback.
The DB is a backstop, not the boundary — verified on the LANDED ENGLISH schema (#445, migration 0035):

- MUTABLE by `app_user` (full SELECT/INSERT/UPDATE/DELETE) — the whole document/capture layer:
  `accounting_event`, `summary_record` (the doklad), `individual_record`, `partial_record`,
  `chart_of_accounts`, `account`, `category`, `counterparty`, `accounting_period`, `vat_status`,
  `number_series`, `asset`, `depreciation_plan`, `tax_depreciation`, `inventory_count`,
  `inventory_count_line`, `organization_business_activity`. The DB does NOT protect a captured document
  from post-hoc edit/delete.
- APPEND-ONLY (BEFORE UPDATE/DELETE/TRUNCATE triggers `app_block_mutation_accounting`, authoritative
  regardless of role) — 6 tables: `posting`, `posting_double_entry_line`, `posting_monetary_line`,
  `signature`, `period_output`, `open_item_settlement`. A change to a posted record is a NEW posting
  (`corrects_posting_id`, R8 ČÚS 001 §35), never an edit.
- `open_item` is MUTABLE-but-locked: `app_user` gets SELECT+INSERT only; `settled_amount` moves ONLY via
  the SECURITY-DEFINER settlement-ledger trigger. A dedicated BEFORE UPDATE/DELETE trigger
  (`app_block_open_item_direct_write`) is its authoritative block.
- Closed-period is BEFORE **INSERT** only (`app_assert_period_writable` via per-table
  `*_period_guard` triggers on `posting`, `summary_record`, the two line tables, `accounting_event`,
  `individual_record`, `partial_record`, `open_item_settlement`). It does NOT block UPDATE/DELETE of a
  mutable document/capture row in a closed period. A reopen gate (BEFORE UPDATE on `accounting_period`)
  restricts CLOSED->OPEN to `app_admin`/`app_owner`.
- The `0035` REVOKE UPDATE/DELETE on the append-only tables is **INERT** by design: `app_user` inherits
  `app_admin`'s DML (`GRANT app_admin TO app_user`, migration 0002), so `has_table_privilege` stays true.
  The BEFORE triggers — not the REVOKE — are the real defense (the migration says so verbatim, lines
  100-101 and 238-245).

Consequences, absolute (re-grounded server-side):

- **No UPDATE/DELETE document tool.** The Brain's tool surface exposes create/capture/post only; no
  mutation of a captured or posted row.
- **No raw-SQL / text-to-SQL on the write side.** A semantically-wrong-but-valid statement passes RLS.
  The Brain writes only through the typed accounting API/MCP tools (create event / capture document /
  post posting), never a SQL string.
- The client's claimed `confidence` is NECESSARY but not SUFFICIENT: the server VETO
  (`deriveCaptureVeto`/`derivePostingVeto`) + the fail-closed evidence SCORE (`evaluateEvidence`) can force
  HOLD regardless. At cold start green is structurally unreachable -> everything HELD (the intended
  pre-launch posture).

## I6 — Held-before-applied (the server gate stages)

A proposed write is not applied until the SERVER gate releases it. `runGatedWrite`
(`accounting-writes.gate.ts`) either auto-applies — ONLY when the three-way AND is green, which is
structurally unreachable at cold start (I5/I8) — or HOLDS it: the write is persisted to the append-only
`tool_call_log` (`auto_applied = false`, `approved_by_user_id` NULL) with a `reviewId` handle, and that
held row IS the staging record. There is no `brain_run_item.staged_payload` table on the landed schema.
The human commit gate is `held-writes.controller.ts` (`resolveHeldWrite`): approve replays the stored
payload via `executeStored` and flips `auto_applied`, reject leaves it held — both in ONE server-side
`withOrganization` tx, tenant + approver taken only from the API-key principal, with an author ≠ approver
rider (a held write can never be approved by the user that authored it). At cold start EVERY agent write
is HELD; human final review (I7) is the master gate.

## I7 — Human-final-review is the master gate

All items pass Hleb's final review before they are treated as final (`committed_at` set). Green = fast
approve; red = focus. The commit gate uses `--on-timeout Hold`: an unanswered gate means **do not
commit**. Fail-safe: an unreachable channel leaves the tenant untouched.

## I8 — Confident-wrong is the cardinal sin

`C_final ≥ 0.95` AND wrong (eval-time vs golden, or review-time per Hleb) → increment
`confident_wrong_count`, **block the next autonomous run**, add an infra signal / eval case, tighten
calibration. Never let confident-wrong rise. Confidence is gated on **infrastructure signals**, never
model-verbalized confidence.

## I9 — Read-side IR only; no write templates

Canonical IR + per-format mapping rules are **parse-side only**. The write side is agent conversation
with the typed functions — no XML / transformation templates.

## I10 — Provenance / průkaznost

Every applied row traces back through the landed audit spine: the `tool_call_log` row
(`input_json` / `output_json`, PII per the audit contract) correlated by `conversation_id`, carrying the
applied entity ids in `output_json` (`eventId` / `summaryRecordId` / `postingId` + `lineIds`).
Idempotency uses `tool_call_log.UNIQUE(organization_id, tool_name, idempotency_key)` (migration 0004)
for replay-detect; per-run rollback keys off `conversation_id` (I4) — two distinct mechanisms. The
`tool_call_log` row is append-only, so the provenance trail cannot be rewritten.

---

### Enforcement map (constitution-checks)

| Invariant | Executable check (`constitution-checks/check.sh`)                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I2        | `withAdminBypass` absent anywhere under `packages/brain/src/` (an aliased call is caught via its import)                                                  |
| I3        | no `organization_id`/`user_id`/`workspace_id`/`role` in DECLARATION position (property/param/destructure/optional/`Pick<…>` literal) under `src/tools/**` |
| I5        | no Drizzle `.update(`/`.delete(`/`.insert(`, no raw `UPDATE`/`DELETE`/`sql\`…\``/`.execute(`/`.query(`(case-insensitive) under`src/tools/\*\*`            |

**Scope convention (load-bearing):** tool/function INPUT types live under `src/tools/**`. The
`organizationId`/`userId` on STORED domain ROW types (`BrainRun`, `BrainRunItem`) are NOT inputs — they
are intentionally out of the I3 scope (they are stored bookkeeping row types, not tool inputs; banning the
field everywhere would false-positive these legitimate row types). Do not define a tool input outside `src/tools/**`.

**Post-reframe: I5's PRIMARY enforcement moved server-side.** Under the v1 HTTP/MCP-client model
(#445 (+#462 held-writes)) the correctness/immutability boundary is the API request-schema + the
server-side gate (`runGatedWrite`, three-way AND), not the in-process function boundary. The `check.sh`
grep of `packages/brain/src/tools/**` for a Drizzle/raw-SQL write is therefore now a **defense-in-depth
BELT on the client** (the unprivileged client must contain no DB writes at all), not the boundary
itself. The grep semantics are unchanged — only its role: belt, not boundary.

**No ESLint backstop for I2/I5:** `packages/eslint-config`'s `require-with-organization` rule enforces
I1 but **permits** `withAdminBypass`, so `check.sh` is the **sole automated** defense for I2/I5 — it is
hardened + self-tested accordingly (advisor-gated, WP-0.2).

Checks self-test against `scripts/brain-build/constitution-checks/__fixtures__/known-bad.txt` — every
realistic evasion form (Drizzle write, lowercase SQL, optional/shorthand/`Pick` I3 field, aliased
import) must fire; the real tree must be clean. I1/I4/I6/I7/I8/I10 gain executable checks as their
target code lands (tools/write, runtime, migration); until then they are human-review + advisor-gate
enforced.
