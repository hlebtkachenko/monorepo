# Afframe Brain v1 — Status & Roadmap Tracker

The **tracked, in-repo** source of truth for where Brain v1 stands: what's done, what's outstanding,
what's deferred to v2, and the open GitHub issues that gate each piece. Companion to the
[index](AFFRAME-BRAIN.md) and the [technical reference](AFFRAME-BRAIN-TECHNICAL.md).

> A more granular working board lives at `.context/afframe-brain/V1-REMAINING-MILESTONES.md`, but that is
> gitignored (agent scratch). **This file is the durable, reviewable tracker** — keep it current when a
> milestone or issue changes.

**Last updated:** 2026-07-11 · **Umbrella epic:** [#524](https://github.com/hlebtkachenko/monorepo/issues/524)
(Finish Afframe Brain v1).

> **2026-07-11 — M2/M3 ENGINEERING landed to `main`.** The code that enables the M2 marathon + M3 lift
> merged (squash, reviewed brain-gate/Advisor, migrations 0055/0056): **#643** booking-template library
> + model routing (+ the **§I9 constitution amendment**, Hleb-authored), **#644** librarian distillation
> engine (propose-only), **#645** close #565 evidence-gate floor route-arounds, **#669** DPH ř.12/13 §108
> + RENT→ř.5/6. The M3 engineering ships as **green, OPEN (unmerged) PRs, inert/floored** — **#647**
> server-side extraction re-verifier (unconsumed), **#648** wire-calibration-into-gate + F1
> shadow-preservation, **#646** run-log ingestion — all brain-gate/Advisor-GO on the merged state, kept
> unmerged because ACTIVATION (un-flooring + the calibration fit) is data-gated on the M2.3 marathon and
> re-gates then. Cold-start stays HELD everywhere; nothing auto-applies. **Still process-gated:** the M2
> human-review marathon needs Hleb's labeled 2025 ground-truth folder.

**Prod runtime:** `BRAIN_RUNTIME_ACTIVE=1` (admission lane open) — **every write still HELDs at cold start;
nothing auto-applies.** The full live end-to-end loop was confirmed on production on 2026-07-07 (a real
agent key drove `brain run --live` → `202 HELD` with a recorded shadow score).

---

## Milestones M1 → M4

| Milestone                                                 | One-line                                                                                                           | Status                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** — Operator onramp + write-path instrumentation     | Make the live HELD loop turnkey; instrument the write path for calibration data                                    | **DONE (engineering) + LIVE-CONFIRMED on prod (2026-07-07).** W1.2–W1.5 merged (v0.16.8); the W1.6 operator runbook (#574) + the local stdio MCP bridge (#575) shipped in v0.16.9; W1.7 live-confirmed on prod 2026-07-07. Caveat: **W1.1** (a real _wizard_-scaffolded prod org) is still blocked by [#579](https://github.com/hlebtkachenko/monorepo/issues/579) — the live run used a hand-scaffolded workspace. |
| **M2** — Supervised production: the human-review marathon | Book a real org's 2025 accounting, everything HELD, review/correct each until ≥10 clean runs, zero confident-wrong | **OUTSTANDING — NEXT (process, not started).** The long pole, now unblocked to start. Pre-M2 engineering largely landed (OCR fail-closed leg #554, issued-EU reverse-charge #541, shadow-scoring). The human-review runs (W2.3–W2.5) have not begun.                                                                                                                                                                |
| **M3** — Calibration fit + safe field-by-field lift       | Fit calibration from M2 runs; un-floor base-score fields behind server re-verification; re-gate                    | **OUTSTANDING — data-gated.** Refit MATH is built + tested (`calibration.ts` + `refit.test.ts`). Outstanding engineering: the RunLogEntry ingestion pipeline, server-side re-verification of every base-score fact (the big build), and the cert harness. The fit + field-by-field lift are data-triggered (need ≥10 shadow-scored M2 runs).                                                                        |
| **M4** — Certification + go-live: auto-apply ON           | Certify on a held-out set (0 confident-wrong, Brier ≤ 0.04); build operable rollback; flip auto-apply              | **OUTSTANDING — process-gated (Hleb's explicit call).** Not reachable until M3 is fit + re-gated. Operable rollback of an auto-applied booking (mass-storno by `conversation_id`) is outstanding engineering that must exist before auto-apply.                                                                                                                                                                     |

---

## The "engineering-done" boundary

**Counts as v1-engineering-complete:** all of M1 (except W1.1, blocked on #579) · the OCR templateId
fail-closed leg (#554, shipped v0.16.8) · shadow-scoring (v0.16.8) · **and** the still-outstanding
W3.1 RunLogEntry ingestion pipeline + W3.3a server-side re-verification of every base-score fact (the
multi-thousand-line build) + W4.2 operable rollback of an auto-applied booking.

**Does NOT count** (real code, but runs on M2 data or is process): W3.2 calibration fit + wiring · W3.3b
field-by-field cold-start relaxation · the M2 human-review runs themselves (the load-bearing long pole).

**Invariants that gate everything (never weaken):**

1. Server three-way AND + the `extraction_failed` cold-start block + the `BRAIN_RUNTIME_ACTIVE`
   kill-switch stay intact; any lift lands field-by-field behind server-side re-verification + a full re-gate.
2. No base-score field (`extractionQuality`/`kbRule`/`verify`/`reconciliation`/`cRaw`) may ever be
   un-floored from a **client-supplied** value — only server-recomputed evidence may lift one.
3. Confident-wrong is the cardinal sin; M3/M4 require **real reviewed runs**, never fabricated data.

---

## Explicitly deferred to v2 (do NOT build for launch)

| Item                                                        | Issue                                                               | Reason                                                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-instance admission caps via shared state (Redis/DB)   | [#472](https://github.com/hlebtkachenko/monorepo/issues/472) (open) | Single Fargate task today; per-instance caps suffice.                                                                                                                              |
| Web upload → OCR/extraction → batch ingestion pipeline      | [#518](https://github.com/hlebtkachenko/monorepo/issues/518) (open) | v1 is Hleb's own local Claude Code sessions, not an in-app upload flow. _(Note: #470, the `/documents/inbox` hub shell, is already built + closed — it is not the deferred item.)_ |
| Real-customer Brain via in-app chat                         | —                                                                   | v1 = Hleb's own Claude Code sessions with subscription auth; customer-facing chat is post-v1.                                                                                      |
| Hosted Streamable-HTTP MCP (`mcp.afframe.com` / api `/mcp`) | —                                                                   | v1 uses the local stdio MCP bridge (#575, shipped) — no 8th container, no DNS/CDK. The hosted transport is the eventual B2+ shape.                                                 |

---

## Open GitHub issues (verified 2026-07-08)

| #                                                            | Title                                                                                  | Gates                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [#579](https://github.com/hlebtkachenko/monorepo/issues/579) | create-org wizard does not scaffold accounting period/series                           | **M1 / W1.1** — blocks a real wizard-scaffolded prod org.                                             |
| [#577](https://github.com/hlebtkachenko/monorepo/issues/577) | MCP tool codegen drops `.uuid()` on conversationId (server enforces → 400)             | Hardening (codegen drift). Docs already say UUID.                                                     |
| [#578](https://github.com/hlebtkachenko/monorepo/issues/578) | `canUseTool` default-deny gate shadowed by `allowedTools`                              | Hardening. Not a live hole (allowlist + server gate hold); weakens the "3 sandbox layers" claim to 2. |
| [#565](https://github.com/hlebtkachenko/monorepo/issues/565) | close `extraction_method` client-declaration + unscreened `/v1/invoices` route-arounds | **W3.3b blocker** (floor-lift precondition).                                                          |
| [#569](https://github.com/hlebtkachenko/monorepo/issues/569) | calibration safety guards (degenerate-fit + extrapolation)                             | **W3.2 / W3.3b blocker.**                                                                             |
| [#540](https://github.com/hlebtkachenko/monorepo/issues/540) | DPH ř.12/13 + place-of-supply routing                                                  | W2.2 statutory; queued after #541; needs a migration.                                                 |
| [#566](https://github.com/hlebtkachenko/monorepo/issues/566) | export (§66 vývoz) vatMode conflation + missing DAP ř.22                               | Statutory sibling of #541; M2-adjacent.                                                               |
| [#472](https://github.com/hlebtkachenko/monorepo/issues/472) | cross-instance admission caps                                                          | Deferred to v2.                                                                                       |
| [#524](https://github.com/hlebtkachenko/monorepo/issues/524) | EPIC: Finish Afframe Brain v1                                                          | Umbrella.                                                                                             |

**Issues whose fix already merged but the issue is still open** (treat the code as landed): #554 (primary
OCR fail-closed leg shipped in PR #568, v0.16.8; residual tracked as #565) and #541 (issued-EU
reverse-charge shipped in PR #567, v0.16.8).

**ADRs 0025–0029** are all still marked `Proposed` despite the subsystem being implemented + live — a
status-line update pass to `Accepted` would let the ADRs reflect shipped reality.
