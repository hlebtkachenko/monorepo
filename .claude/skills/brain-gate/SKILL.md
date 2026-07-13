---
name: brain-gate
description: Run the mandatory adversarial safety gate for Afframe Brain, accounting write-gate, or safety-spine changes before Hleb reviews them.
disable-model-invocation: true
---

# Brain Gate

`.claude/workflows/brain-gate.js` is the canonical source of truth for the
safety spine, reviewer prompts, verdict schemas, and stricter synthesis rule.
Read it completely before starting the gate. Do not duplicate its embedded
standards in this skill or another prompt file.

## Execution

1. Build a review brief containing the diff or plan, affected files, and exact
   questions the gate must answer.
2. When the `Workflow` tool is available, run:

   ```
   Workflow({ scriptPath: ".claude/workflows/brain-gate.js", args: "<review brief>" })
   ```

3. When `Workflow` is unavailable, use the client's subagent controls to
   reproduce the workflow exactly:
   - Run two independent top-tier reviewers using the workflow's two review
     lenses, safety spine, and verdict schema.
   - Give both reviewers real repository read access and require verification
     against source, not the brief.
   - Run a separate synthesis using the workflow's stricter-verdict rule and
     synthesis schema.
4. If independent subagents are unavailable, stop and report that the mandatory
   gate cannot run. Never replace it with one inline opinion.

Return the two independent verdicts plus the synthesized final ruling. Never
edit, stage, commit, or weaken the safety spine as part of this review.
