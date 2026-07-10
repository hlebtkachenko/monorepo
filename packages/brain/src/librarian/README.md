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
CandidateRule | null   (majority-vote decision, best-effort — may be null: too few
                        corrections, or nothing but rejects)
        │  evaluateCandidate()            eval-gate.ts
        ▼
CandidateEvalResult     (agreement rate vs the booking_rule_pr_gate bound, 0.90 — the
                        SAME threshold already locked in
                        scripts/brain-build/eval-thresholds.lock)
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
a second full payload; `ingestCorrections` reconstructs the human's final decision by merging it
onto the proposal (`deriveDecision` — a comparison-only merge, not the real per-tool replay used to
actually book anything).

The 4-fact cluster signature (`counterpartyKey` / `direction` / `supplyKind` / `jurisdiction`) is
read directly off `input_json` (fail-closed: unreadable ⇒ excluded, never guessed). It mirrors the
unmerged `feat/brain-booking-templates` (#643, M2.1) `BookingSignature` shape — the same 4 facts a
`booking_template` match already keys on — so that when M1.2 (the reasoning lane, unmerged #639)
and M2.1 land, their real field names can replace this mirror with a straight swap, not a redesign.

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
  `evaluateCandidate` scores a candidate against its OWN source cluster (a same-population
  consistency check) — the correct measure for "is there a real majority in what's been seen so
  far", and exactly `booking_rule_pr_gate`'s stated surface, but not a generalization test.
- **`aliases`/`judge`/`memory`** — this PR only builds the `rules`-shaped half of the loop (a
  proposed booking treatment for a signature). Counterparty-alias distillation and judge
  calibration are a separate, later slice (their own `.brain/` subdirs stay README-only).
