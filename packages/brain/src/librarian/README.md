# The librarian — M2.2 self-improving loop (propose-only)

> Code anchor named in [ADR-0027](../../../../docs/adr/0027-brain-learning-artifact-store.md):
> "Follow-up work required: WP-1.11 — librarian (propose-only): cluster → proposed rule → GitHub PR
> via `workflow_dispatch`." This directory is that engine's ENGINE half — the pure pipeline. The PR
> automation half is explicit follow-up (see "Not built here" below).

## The pipeline

```
RawCorrectionRow[]  (tool_call_log rows + their resolve outcome)
        │  ingestCorrections()            correction.ts
        ▼
CorrectionRecord[]  (signature + proposedInput + resolution + decision)
        │  clusterCorrections()           cluster.ts
        ▼
CorrectionCluster[] (grouped by 4-fact signature)
        │  distillCandidate()             distill.ts
        ▼
CandidateRule | null   (majority-vote over the TREATMENT-normalized decision, best-effort
                        — may be null: too few corrections, or nothing but rejects)
        │  evaluateCandidate()            eval-gate.ts
        ▼
CandidateEvalResult     (IN-SAMPLE agreement rate vs LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN,
                        0.90 — an in-sample consistency floor, HARDCODED, no override
                        parameter; NOT the held-out booking_rule_pr_gate, which is M2.3)
        │  buildProposalArtifact()        emit.ts
        ▼
ProposalArtifact | null   (null unless evalResult.pass — a failing candidate can NEVER
                          reach this step)
        │  writeProposalArtifact(artifact, dir)   emit.ts
        ▼
<dir>/<candidateId>.json   (a plain JSON file a human reads and reviews)
```

Each stage is a pure function over its fixtures; `pipeline.test.ts` wires all five together
end-to-end against hand-built fixtures.

## The correction record (the ingestion source)

There is exactly one place in the schema where a human's correction of a Brain proposal is
recorded: `tool_call_log.input_json` (the Brain's ORIGINAL proposal, append-only, never mutated)
plus `tool_call_log.output_json` after `resolveHeldWrite` runs — `{ resolution: "approved" |
"rejected", note?, edit? }`. `edit` (the M1.7 edit-before-approve diff — `header` / `vatAmounts` /
`postingLines`, currently only defined in `apps/web`, not exported from any package) is a DIFF, not
a second full payload; `ingestCorrections` reconstructs the human's final decision by replaying it
onto the proposal through the SAME per-tool merge that actually books it (`deriveDecision` →
`applyCorrectionEditReplay` in `replay.ts`, a faithful re-statement of `apps/web`'s
`applyHeldWriteEdit` — it can't be imported here because it transitively pulls `@workspace/accounting`,
off-limits to the Brain). So the treatment the librarian votes on is byte-for-byte the treatment
that would book.

The cluster signature (`counterpartyKey` / `direction` / `supplyKind` / `jurisdiction`, plus the
optional Czech-VAT sub-facts `commodityCode` (§92) and `isAdvance` (§37a)) is read directly off
`input_json` (fail-closed on the four base facts: unreadable ⇒ excluded, never guessed; the
sub-facts default to `null` / `false`). It mirrors the unmerged `feat/brain-booking-templates` (#643,
M2.1) `BookingSignature` shape — the same base facts a `booking_template` match already keys on — so
that when M1.2 (the reasoning lane, unmerged #639) and M2.1 land, their real field names can replace
this mirror with a straight swap, not a redesign. #643's `BookingSignature` must gain the SAME
`commodityCode` + `isAdvance` sub-facts before the matcher activates (cross-PR lockstep — see (a)).

## Treatment normalization (why a rule is not a payload clone)

The vote and the eval agreement run over the **treatment-normalized** decision, not the full
payload. `normalizeDecisionForVote` (`decision.ts`) strips `PER_DOCUMENT_FIELDS` — per-invoice
amounts (`amount` / `base` / `vat` / …), dates, and document-specific ids — wherever they appear
(top-level and inside `postingLines` / `vatAmounts`), keeping only the generalizable treatment
(account / side / scenario / vatMode / vatJurisdiction / vatRate / rateLabel). Without this, two
invoices from the same supplier for the same supply would count as different decisions (every amount
differs) and clusters would almost never converge; and any candidate that did emerge would embed one
invoice's fixed amount — domain-wrong. The emitted `proposedDecision` is therefore the normalized
treatment, never a payload with a frozen amount.

## The safety argument (read before touching this directory)

1. **Reviewable diffs, never opaque prod rows.** The only filesystem write in this whole pipeline
   is `writeProposalArtifact`, and it writes a `status: "proposed"` JSON file to a directory the
   CALLER supplies — there is no default, so nothing in this code can silently target a real repo
   path. The artifact is inert data; nothing reads it back into a live system. Promoting a proposal
   into a real `.brain/rules/*.md` entry (and opening the `workflow_dispatch` PR ADR-0027
   describes) is a separate, human-initiated step this module does not perform.
2. **A rejected candidate structurally cannot become an artifact.** `buildProposalArtifact` returns
   `null` whenever `evaluateCandidate`'s `pass` is `false` — there is no code path from a failing
   eval result to a non-null `ProposalArtifact`, enforced by a dedicated test
   (`emit.test.ts`: "returns null for a failing eval result").
3. **No DB, no gate, no constitution.** This directory contains no import of `@workspace/db`, no
   `withOrganization` and no DB-role-escalation call (the check below greps for it under its real
   name), no reference to `runGatedWrite` / `evidence-gate.ts` / `accounting-veto.ts` /
   `accounting-writes.gate.ts`, and it never touches `packages/brain/.brain/constitution.md`.
   `scripts/brain-build/constitution-checks/check.sh` (I2, run over ALL of `packages/brain/src`,
   including this README) passes clean; this directory has no `src/tools/**` surface at all, so
   I3/I5 don't even apply.
4. **Data-gated.** Every fixture in this directory's tests is hand-built — no real correction has
   ever flowed through this pipeline. Running it against real `tool_call_log` rows, and actually
   invoking `writeProposalArtifact` against a real target directory, is future work gated on M2.3
   (the marathon) producing real reviewed corrections.

## Not built here (explicit follow-up)

- **The `RawCorrectionRow` data source** — a query/adapter reading real `tool_call_log` rows into
  this shape. Needs real corrections (M2.3) to be worth building against.
- **PR automation** — opening the GitHub PR via `workflow_dispatch` ADR-0027 describes. This PR
  ships the propose-only ENGINE + the documented artifact format; wiring "artifact → PR" is WP-1.11
  continuation work, not done here.
- **Reconciling the signature mirror against #643/#639** once those merge (see above).
- **A true held-out eval** against `.brain/evals/cases/**` golden fixtures, once fixtures exist for
  the learned-rule surface (`.brain/evals/` is empty today — see its README). Today
  `evaluateCandidate` scores a candidate against its OWN source cluster (an in-sample consistency
  check gated by `LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN`) — the correct measure for "is there a real
  majority in what's been seen so far", but NOT a generalization test and deliberately NOT the locked
  held-out `booking_rule_pr_gate` bound (that gate is wired in M2.3 when the harness + labeled cases
  exist).
- **`aliases`/`judge`/`memory`** — this PR only builds the `rules`-shaped half of the loop (a
  proposed booking treatment for a signature). Counterparty-alias distillation and judge
  calibration are a separate, later slice (their own `.brain/` subdirs stay README-only).

## M2.3-promotion preconditions (address BEFORE the real-correction adapter lands)

These were inert (the engine has zero real callers), but each had to be resolved before a real
`tool_call_log → RawCorrectionRow` adapter feeds live corrections in — the difference between an
honest engine and one that quietly over-clusters or misleads a reviewer. Status below.

- **(a) The 4-fact signature omits decisive Czech-VAT sub-facts. — PARTIALLY DONE.**
  `CorrectionSignature` now also keys on `commodityCode` (§92 kód předmětu plnění) and `isAdvance`
  (§37a advance/settlement discriminator, `supplyKind === "ADVANCE"` OR `advanceSettlement === true`),
  so distinct §92 / §37a sub-cases key distinctly (`signature.ts` + `signature.test.ts`). STILL
  PENDING: threshold-gated goods PDP is not yet modeled as a sub-fact, and #643's real
  `BookingSignature` (`packages/db/src/schema/booking_template.ts`) MUST gain the SAME sub-facts
  before the booking-template matcher activates (cross-PR lockstep — not edited here).
- **(b) The eval reused the `booking_rule_pr_gate` NUMBER for a weaker measure. — DE-MASQUERADED.**
  `evaluateCandidate` now gates on its own named `LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN` (0.90, "min"),
  an in-sample consistency floor that is independent of — not a mirror of — the locked held-out
  `booking_rule_pr_gate` bound, so an in-sample pass can never read as the held-out promotion gate.
  STILL M2.3: the true held-out eval against `.brain/evals/cases/**` (which needs the harness + real
  labeled cases, the data wall) is the promotion gate, wired when those exist.
- **(c) `candidateId = hash(signature-only)` silently overwrote. — DONE.** `candidateId` now hashes
  the signature AND the normalized `proposedDecision` (`normalizeDecisionForVote`), so a re-distilled
  CHANGED proposal for the same signature gets a distinct filename instead of overwriting the prior
  one; a byte-identical re-run still collides (idempotent regenerate, intended) — `distill.ts` +
  `distill.test.ts`.
- **(d) `deriveDecision`'s shallow comparison-merge diverged from the real replay. — DONE.**
  `deriveDecision` now replays the edit through `applyCorrectionEditReplay` (`replay.ts`), a faithful
  per-tool re-statement of `apps/web`'s `applyHeldWriteEdit` (imported cleanly is impossible — it
  pulls `@workspace/accounting`, off-limits to the Brain — so it is replicated verbatim, single
  source of truth noted in `replay.ts`). The treatment the librarian votes on is now byte-for-byte
  the treatment that would book (`correction.ts` + `correction.test.ts`).
- **(e) FLAT-vs-NESTED input contract — LOAD-BEARING, STILL M2.3 (the #1 wire-up precondition).**
  `readCorrectionSignature` reads `counterpartyKey` / `supplyKind` / `jurisdiction` / `commodityCode`
  / `advanceSettlement` at the TOP LEVEL of the correction input — the librarian's own synthetic flat
  contract (what the fixtures feed). In the REAL `tool_call_log.input_json`, `commodityCode` /
  `advanceSettlement` (and the base facts) live NESTED under `lines[].partials[]`, and
  `counterpartyKey` is not present at all. So against a raw real row every field is `undefined` and
  the row is skipped. The `tool_call_log → RawCorrectionRow` adapter (M2.3) MUST resolve the
  flat→nested mapping AND a multi-partial ambiguity (a document with several partials of differing
  `commodityCode`/`advanceSettlement` has no single document-level value) before any real correction
  is ingested. This is pre-existing to the librarian's flat design; fixes (a)–(d) extend the same
  contract, they do not close this. (Two independent Advisor reviews flagged this as the load-bearing
  item.)
- **Follow-ups (non-blocking, tracked):** (1) `decision.ts` `normalizeDecisionForVote` strips
  `date`/`issueDate` but NOT the real payload date keys `occurredAt`/`issuedAt`/`entry.postingDate`,
  so per-document dates leak into the voted decision + `candidateId` (same-treatment corrections with
  different dates fail to converge); fix (d)'s faithful replay lands an edited date on those
  un-stripped keys, slightly widening the pre-existing leak — reconcile `PER_DOCUMENT_FIELDS` at
  wire-up. (2) The `replay.ts` ↔ `apps/web` `edit-model.ts` lockstep is enforced only by a comment —
  add a shared-fixture parity guard (or CODEOWNERS coupling) so a future `edit-model.ts` change can't
  silently drift the replay.
