# Afframe Brain — A to Z

The single landing doc for Afframe Brain. If you are a new engineer or an external reviewer, start
here: this explains what Brain is, how it is built, how it stays safe, how to run it, and where every
detailed document lives. Everything below was verified against the tracked source (ADRs, the
constitution, the write-gate code, the operator runbooks) — not against planning notes.

> **Going deeper?** This page is the index. For the **debug-level technical reference** — the full request
> trace, the gate/confidence/DB/transport/auth internals with `file:line` citations, and a troubleshooting
> playbook — read [`docs/AFFRAME-BRAIN-TECHNICAL.md`](AFFRAME-BRAIN-TECHNICAL.md).

> **Status (2026-07-08):** Brain v1 is **live-confirmed end-to-end on production** (pre-launch, no real
> users). A real agent key drove the full loop to a real `202 HELD` write with a recorded shadow score.
> Milestone **M1 is engineering-done**; the next phase (**M2**) is a human-review marathon, not code.
> All Brain ADRs are still `Proposed` status — the design is settled in practice but not formally accepted.

---

## 1. What Brain is (in one minute)

Afframe Brain is an **agent that proposes Czech-accounting bookings** for a client organization's
documents (invoices, bank statements, cash docs) and routes **every** proposal to a **human for final
review**. It does not book autonomously in the current posture: it _proposes_, a person _disposes_.

The product framing is **agent-native, not AI-native**: there are no per-supplier write templates the
Brain fills in. It reads a messy per-org document dump, reasons about the correct booking against the
Czech accounting knowledge base, and writes through the same public accounting API a human integrator
would use — under a server-side confidence gate that holds anything not proven safe.

**The cardinal rule under everything (constitution §I8):** _confident-wrong is the sin._ A booking that
is `confidence ≥ green-threshold` yet **wrong** is the single worst outcome — worse than holding a
correct booking for review. The whole design exists to make confident-wrong structurally hard.

---

## 2. Architecture (v1)

**Brain v1 is an unprivileged external client of the accounting system — NOT a server-side worker.**
This is the load-bearing shape (ADR-0025, amended 2026-07-01; it supersedes the original in-process
worker design still described in the stale `packages/brain/README.md`).

```
  Operator's Mac                                    AWS (the SERVER, unchanged)
  ─────────────                                     ───────────────────────────
  Claude Code session  (the operator harness)
        │  runs `afframe brain extract | book | run`
        ▼
  nested Claude Agent-SDK session  (sandboxed: default-deny tools, no Read/Bash)
        │  calls the MCP tool  mcp__afframe__capture_accounting_document
        ▼
  LOCAL stdio MCP bridge  (`@afframe/mcp` via tsx, no build step)
        │  ordinary outbound HTTPS,  Bearer = the agent key
        ▼
  POST https://api.afframe.com/v1/accounting/*   ← the public REST API (NestJS on Fargate)
        │  API-key guard → withOrganization (tenant from the key principal, never from the body)
        ▼
  SERVER WRITE GATE  (runGatedWrite — three-way AND)
        │  cold start ⇒ extraction_failed floor ⇒ 202 HELD  +  a shadow score recorded
        ▼
  /{orgSlug}/accounting/approvals   ← a human reviews / approves / corrects (the master gate)
```

Key consequences of "client, not server":

- The Brain holds **no DB credentials**. The organization is resolved **server-side** from the API-key
  principal and is **never a tool input**.
- The only thing deployed on AWS is the ordinary web/API/admin stack. There is **no hosted MCP server**;
  the MCP transport runs **locally** as a stdio bridge (see §6). Fargate is only the server.
- The agent runs inside a **sandboxed nested session**: a default-deny tool allowlist (only the
  `mcp__afframe__*` accounting tools), no `Read`/`Bash`/`Write`/network — so a hostile document it reads
  cannot steer a filesystem read or an exfiltration.

---

## 3. The safety spine — the constitution (I1–I10)

The invariants are in `packages/brain/.brain/constitution.md` (LOCKED — the agent proposes changes and
gates them, it never self-commits; ADR-0027). Their enforcement point moved from in-process to the
**server-side accounting endpoint**, but they still hold. Automated checks live in
`scripts/brain-build/constitution-checks/`.

| #       | Invariant                                                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **I1**  | Server-side `withOrganization`; the Brain client cannot forge a tenant.                                                                 |
| **I2**  | NEVER `withAdminBypass` on agent writes.                                                                                                |
| **I3**  | No tenancy fields (`organization_id`/`user_id`/`workspace_id`/`role`) in any tool input schema.                                         |
| **I4**  | The `tool_call_log` row + its `conversation_id` is the rollback unit (postings are corrected via `corrects_posting_id`, never deleted). |
| **I5**  | The API request-schema boundary is PRIMARY; the DB protects almost nothing at the document layer.                                       |
| **I6**  | Held-before-applied — the server gate stages every write.                                                                               |
| **I7**  | Human-final-review is the master gate.                                                                                                  |
| **I8**  | Confident-wrong is the cardinal sin.                                                                                                    |
| **I9**  | Read-side IR only; no write templates.                                                                                                  |
| **I10** | Provenance / průkaznost on every booking.                                                                                               |

An **agent** API key (`actor_kind='agent'`) may _propose_ gated writes but is **denied (HTTP 403)** the
held-write review surface — it can never approve its own work (I7).

---

## 4. The write gate + confidence model

Every write flows through `runGatedWrite` (`apps/api/src/v1/accounting/accounting-writes.gate.ts`). To
**auto-apply**, a **three-way AND** must hold: client `confidence ≥ threshold` **and** the server veto
does not fire **and** the server-recomputed evidence score is green.

At **cold start** (the current pre-launch posture) the gate injects an **unconditional
`extraction_failed` floor** on every write, so the evidence score sits on the floor and green is
**structurally unreachable** → every write returns **`202 HELD`** with a `reviewId`. A `201 applied` at
cold start is **impossible**; if one ever appeared it would mean the gate is broken. Nothing auto-applies
today.

**Confidence is infrastructure-gated, calibrated, and NEVER model-verbalized** (ADR-0026, the "D6"
engine). The model's own claimed certainty carries zero weight and can never lift a proposal into the
green lane; the score is computed server-side from infrastructure signals (extraction quality, KB-rule
tier, verify checks, reconciliation, template confirmation) and a calibration map.

**Shadow score (instrumentation).** Every capture also persists a second, pure scoring pass at
`tool_call_log.output_json.serverGate.shadow` — a `serverLane` (server-derivable signals only, the future
calibration x-axis), a `claimLane` (client-claimed, diagnostic), and a `claimAudit` (per-write honesty
deltas). It is audit-only and never read for the decision; it exists so the M3 calibration can be re-fit
from real runs.

**Admission lane / kill-switch (ADR-0028, the "marshrutizátor").** The `/v1/accounting` write lane is
gated by a server-side kill-switch, `BRAIN_RUNTIME_ACTIVE`. When off, every write returns `429 "the
accounting write runtime is disabled"`. It is a **deploy-time flag, fail-closed OFF by default** — see the
operational caveat in §9.

---

## 5. Learning (how Brain improves)

- **Learning artifacts live in the `packages/brain/.brain/` git tree, written only via a GitHub PR**
  (ADR-0027): corrections distil into reviewable rules/templates that land as diffs behind review + eval,
  never as opaque prod-DB rows. The constitution itself lives here and is human-authorship-only.
- **Learned state is workspace-scoped** (ADR-0029). The first learned artifact is the **OCR template
  library**: a supplier layout learned once per accountant's office (workspace), not relearned per client
  org. A new OCR template is proposed _unconfirmed_; a human confirms it, and only a **confirmed** template
  lets an OCR capture clear the template-novelty screen.

---

## 6. The write path, command by command

The operator drives it from a Claude Code session inside the monorepo. Two shapes (full detail:
`docs/runbooks/BRAIN-OPERATOR-SESSION.md`):

- **PDF / image** → `afframe brain extract <file>` (local vision-OCR, **never books**, emits a canonical
  IR + provenance + a layout fingerprint) → `afframe brain book <file> --extracted <ir.json>`
  (`extractionMethod=ocr`).
- **Folder of structured exports** (Pohoda XML / xlsx / csv) → `afframe brain book <folder>`
  (`extractionMethod=structured`).

Both assemble a `capture_accounting_document` request, print it for inspection (dry-run first), then submit
it live through the stdio bridge. The MCP bridge runs the `@afframe/mcp` server **source** via `tsx` (the
built `dist` is not node-runnable — extensionless ESM imports); the agent key rides in the child process
`env`, never in argv. `BRAIN_MCP_ENDPOINT` is the REST **base** URL (e.g. `https://api.afframe.com`), not
an `/mcp` path — there is no hosted MCP endpoint.

`conversationId` **must be a UUID** (server schema is `z.string().uuid()`); a user-bound agent key logs as
`ai_on_behalf` and requires one on every capture.

---

## 7. The roadmap (M1 → M4)

The definition of done for v1: an operator opens a Claude Code session, it connects to deployed Afframe,
and a real org's accounting flows through the HELD loop → human review (M2) → calibration fit from the
reviewed runs (M3) → certification to auto-apply confident bookings (M4).

> **Live status + open issues:** the authoritative, continuously-updated tracker is
> [`docs/AFFRAME-BRAIN-STATUS.md`](AFFRAME-BRAIN-STATUS.md) — the table below is a summary snapshot.

| Milestone                                             | What                                                                                                                                                                                                                                                                        | Status                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **M1** — Operator onramp + write-path instrumentation | Turnkey live loop, extract→book bridge, shadow-score persistence, one-command session.                                                                                                                                                                                      | **Engineering-done + live-confirmed on prod.**    |
| **M2** — Supervised production marathon               | Run a real org's accounting through Brain, everything HELD, a human reviews/corrects each in `/approvals`, until ≥10 clean reviewed runs with zero confident-wrong.                                                                                                         | **Next — a human-review process, the long pole.** |
| **M3** — Calibration fit + field-by-field lift        | Fit the calibration from the M2 shadow-scored runs; build server-side re-verification of every base-score fact; relax the cold-start floor **field-by-field**, each behind its own re-verification, so green becomes reachable only for genuinely server-verified evidence. | Data-triggered engineering (needs M2 data).       |
| **M4** — Certification + go-live                      | Certification run (0 confident-wrong, Brier target on a held-out set), an operable mass-rollback path, then flip auto-apply ON.                                                                                                                                             | Final.                                            |

**Invariants that gate every milestone (never weakened):** the server three-way-AND + the cold-start
floor + the `BRAIN_RUNTIME_ACTIVE` kill-switch stay intact; no base-score field may be un-floored from a
**client-supplied** value (only server-recomputed evidence may lift one); confident-wrong prevention
requires **real reviewed runs**, never fabricated data. Every Brain / gate / safety-spine change is gated
through two independent top-tier reviewers (`.claude/workflows/brain-gate.js`) before human review.

---

## 8. How to run a live session (operator quickstart)

1. Open a Claude Code session **inside the monorepo**.
2. Ensure production is up (`curl https://api.afframe.com/api/health` → 200) and the write lane is ON
   (see §9).
3. Have an org scaffolded (an open accounting period + a DOCUMENT number series) and a **user-bound agent
   key** issued (admin → Platform → API keys → "Issue Brain agent key"). Put the raw key in
   `docs/runbooks/mlive.local.sh` (gitignored) and `source` it. On the operator's own Mac,
   `BRAIN_AGENT_SDK_AUTH` is the literal `ambient` — the nested Claude uses the machine's Claude Code
   login; no Anthropic token is needed.
4. Follow `docs/runbooks/BRAIN-OPERATOR-SESSION.md`, or paste the bootstrap prompt in
   `docs/runbooks/M2-OPERATOR-BOOTSTRAP-PROMPT.md` into a fresh session.
5. Book documents (extract → book); each returns `202 HELD`. Review + approve every one at
   `https://app.afframe.com/{orgSlug}/accounting/approvals`.

---

## 9. Operational caveats a reviewer must know

- **The write lane is deploy-time gated.** `BRAIN_RUNTIME_ACTIVE` is the runtime kill-switch (fail-closed
  OFF in code — `isBrainRuntimeActive` admits only `"1"`/`"true"`); its value is set at deploy time via the
  `_deploy-aws.yml` `brain_runtime_active` input (ADR-0028). For the pre-launch period that input now
  **defaults to `1`** (PR #584), so a deploy that omits it keeps the lane ON instead of silently killing it
  (v0.16.9 was the foot-gun that motivated the fix — it omitted the input and every write 429'd). Revert the
  default to explicit at launch. To force the lane off, deploy with `brain_runtime_active=0`.
- **No hosted MCP server** exists; the transport is the local stdio bridge. A hosted Streamable-HTTP MCP
  (`mcp.afframe.com`) is a possible v2, not built.
- **Known open follow-ups:** the generated MCP tool schema drops the `.uuid()` on `conversationId`
  (server still enforces it); the nested SDK's `canUseTool` belt-and-braces gate is shadowed by
  `allowedTools` (not a live hole — the allowlist + server gate still hold); the create-org wizard does not
  always scaffold the accounting period/series.
- `packages/brain/README.md` is **out of date** (describes the pre-reframe in-process orchestrator). This
  doc is authoritative for the architecture; that README needs a rewrite.

---

## 10. Where everything lives (doc map)

| Topic                                          | Source                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| This overview (index)                          | `docs/AFFRAME-BRAIN.md`                                                                                             |
| Deep technical reference (debug-level, cited)  | `docs/AFFRAME-BRAIN-TECHNICAL.md`                                                                                   |
| Status / roadmap tracker (v1/v2 + open issues) | `docs/AFFRAME-BRAIN-STATUS.md`                                                                                      |
| Constitution (I1–I10, LOCKED)                  | `packages/brain/.brain/constitution.md`                                                                             |
| Architecture decisions                         | `docs/adr/0025`–`0029` (runtime placement, confidence, learning store, admission/isolation, workspace-scoped state) |
| Run a live session                             | `docs/runbooks/BRAIN-OPERATOR-SESSION.md`                                                                           |
| Fresh-session bootstrap prompt                 | `docs/runbooks/M2-OPERATOR-BOOTSTRAP-PROMPT.md`                                                                     |
| Harness internals (dry-run, sandbox)           | `docs/runbooks/BRAIN-CC-HARNESS.md`                                                                                 |
| The server write gate                          | `apps/api/src/v1/accounting/accounting-writes.gate.ts`                                                              |
| The MCP bridge + nested launcher               | `apps/cli/src/brain/{command,session-config,sdk-launcher}.ts`                                                       |
| Package + agent instructions                   | `packages/brain/CLAUDE.md` (README is stale — see §9)                                                               |
| Operator DB access                             | `docs/runbooks/DB-ACCESS.md`                                                                                        |
