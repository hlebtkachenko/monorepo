# Afframe Brain — Constitution (LOCKED)

> **LOCKED. Human-only.** No agent, subagent, or librarian may edit this file. Changes land only by a
> human commit, advisor-gated (≥2 independent Opus-xhigh). These invariants hold on a **prod
> multi-tenant book**; every claim is verified against the repo + PR #386, not assumed. They are
> enforced as **executable checks** (`scripts/brain-build/constitution-checks/`, BGTG check #4) — this
> is a test that fails, not a doc an advisor skims.

The cardinal rule under everything below: **never raise the confident-wrong rate** (§I8).

## I1 — In-process `withOrganization` only

Every Brain write goes through `withOrganization(organizationId, userId, fn)`
(`packages/db/src/tenancy.ts:212`). The org id is resolved from the `brain_run` record at job start
(`BrainRunContext`) and flows **down** through call arguments. It **never** travels from an agent's
reasoning back up into a tool input. No write reaches the DB by any other path.

## I2 — NEVER `withAdminBypass` on agent writes

`withAdminBypass` (`tenancy.ts:340`) opens a BYPASSRLS `app_admin` transaction. The runtime `app_user`
role **can assume** `app_admin` (`GRANT app_admin TO app_user`, migration `0002_auth.sql`) — so the
boundary is **execution context, not credentials**. The single legitimate BYPASSRLS need (the
closed-period compensating-entry rollback) runs **only** in `brain-control.yml` under the
`brain-production` environment with Hleb as required reviewer — **never** inside the Brain's job /
request path. `withAdminBypass` must not appear anywhere under `packages/brain/src/`.

## I3 — No tenancy fields in any tool/function input

No `organization_id`, `user_id`, `workspace_id`, or `role` in any exported tool/function input type.
The typed write wrappers accept **domain fields only**; tenancy is injected server-side from
`BrainRunContext`. (CLAUDE.md hard rule; verified pattern in `organization.controller.ts`.)

## I4 — `brain_run_id` rollback stamp on every committed live row

Every row the Brain commits to a live accounting table carries `brain_run_id`. Per-run rollback =
`DELETE WHERE brain_run_id = $1` (open period, inside `withOrganization`) or a compensating storno
(closed period — law-as-reference from the KB, never hardcoded). `brain_run_id` is a Track-A schema
dep (GATE-A A3).

## I5 — The DB protects almost nothing at the document layer (the most important safety fact)

Verified on PR #386: `app_user` has full SELECT/INSERT/UPDATE/DELETE on the 15 mutable tables
(incl. `ucetni_doklad`, `doklad_radek`, `dilci_zaznam`, `protistrana`). Only the 3 posting tables
(`ucetni_zapis`, `zapis_radek`, `penezni_denik_radek`) are append-only (R8 BEFORE UPDATE/DELETE
triggers — the `0026` REVOKE is **inert** via grant inheritance, so the triggers are the real defense).
R12 closed-period is **BEFORE INSERT only**; it does not block UPDATE/DELETE of documents — nor edits to
`doklad_radek` / `dilci_zaznam` — in a closed period. **Therefore the typed in-process function boundary + verifier gate +
HITL + per-run rollback is the PRIMARY immutability/correctness boundary, not the DB.** Consequences,
absolute:

- **No UPDATE/DELETE tool for documents.**
- **No raw-SQL writes. No text-to-SQL on the write side** (semantically-wrong-but-valid SQL passes RLS).

## I6 — Staged-before-commit

Items stage in `brain_run_item.staged_payload` first; the human commit gate flips them to live tables.
Provisional live rows (`needs_review = true`, `committed_at` null) are mutable by design (corrections
apply without reversal); the tool layer **refuses** UPDATE/DELETE on finalized rows (`committed_at`
set, period closed).

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

Every committed row traces `committed_target_id → brain_run_item → tool_call_log (PII-redacted input)
→ source_hash → manifest`. Idempotency uses the existing
`tool_call_log.UNIQUE(organization_id, tool_name, idempotency_key)` replay-detect; rollback keys off
`brain_run_id` — two distinct mechanisms.

---

### Enforcement map (constitution-checks)

| Invariant | Executable check (`constitution-checks/check.sh`)                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I2        | `withAdminBypass` absent anywhere under `packages/brain/src/` (an aliased call is caught via its import)                                                  |
| I3        | no `organization_id`/`user_id`/`workspace_id`/`role` in DECLARATION position (property/param/destructure/optional/`Pick<…>` literal) under `src/tools/**` |
| I5        | no Drizzle `.update(`/`.delete(`/`.insert(`, no raw `UPDATE`/`DELETE`/`sql\`…\``/`.execute(`/`.query(`(case-insensitive) under`src/tools/\*\*`            |

**Scope convention (load-bearing):** tool/function INPUT types live under `src/tools/**`. The
`organizationId`/`userId` on STORED domain ROW types (`BrainRun`, `BrainRunItem`) are NOT inputs — they
are intentionally out of the I3 scope (the org flows down via `BrainRunContext`; banning them everywhere
would false-positive the legitimate row types). Do not define a tool input outside `src/tools/**`.

**No ESLint backstop for I2/I5:** `packages/eslint-config`'s `require-with-organization` rule enforces
I1 but **permits** `withAdminBypass`, so `check.sh` is the **sole automated** defense for I2/I5 — it is
hardened + self-tested accordingly (advisor-gated, WP-0.2).

Checks self-test against `scripts/brain-build/constitution-checks/__fixtures__/known-bad.txt` — every
realistic evasion form (Drizzle write, lowercase SQL, optional/shorthand/`Pick` I3 field, aliased
import) must fire; the real tree must be clean. I1/I4/I6/I7/I8/I10 gain executable checks as their
target code lands (tools/write, runtime, migration); until then they are human-review + advisor-gate
enforced.
