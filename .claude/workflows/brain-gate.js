/* eslint-disable no-undef -- agent/parallel/phase/log/args/budget are Workflow-tool runtime globals */
export const meta = {
  name: "brain-gate",
  description:
    "Adversarial safety gate for Afframe Brain changes — 2 independent top-tier reviewers hunt confident-wrong paths + safety-invariant violations",
  whenToUse:
    "Before Hleb reviews any Brain / accounting-write-gate / safety-spine change. Pass the review brief (plan or diff + the exact questions) as args.",
  phases: [
    { title: "Review", detail: "Opus 4.8 xhigh ×2, independent lenses" },
    {
      title: "Synthesis",
      detail: "Opus 4.8 xhigh reconciles the two verdicts",
    },
  ],
}

// args = the review brief: a string containing the change description / plan / diff and the specific
// questions the gate must answer. The gate NEVER weakens the safety spine — it only rules whether the
// change preserves it. Two independent top-tier models review (advisor-always-top-tier: >=2 independent),
// then a synthesis reconciles.

const brief = typeof args === "string" ? args : JSON.stringify(args, null, 2)

const SPINE = `
AFFRAME BRAIN SAFETY SPINE — the invariants a change MUST NOT weaken:
1. CONFIDENT-WRONG IS THE CARDINAL SIN: a write with confidence >= green-threshold that is wrong. It must
   be structurally impossible in the auto-apply lane.
2. Server-side auto-apply requires a THREE-WAY AND, each leg independent:
   (client confidence >= threshold AND !veto.held AND server score.isGreen).
   apps/api/src/v1/accounting/accounting-writes.gate.ts.
3. At cold start evidence-gate.ts injects the Tier-3 'extraction_failed' signal -> cRaw=0 -> green is
   STRUCTURALLY UNREACHABLE -> every agent write is HELD for human review. Never weaken this to "restore green".
4. The client 'signals' envelope is self-reported and NEVER consumed directly; every unverifiable field is
   degraded fail-closed before server scoring.
5. Write lane ships OFF (BRAIN_RUNTIME_ACTIVE fail-closed). The kill-switch is the deliberate launch turn-on.
6. LOCKED .brain/constitution.md is human-authorship-only: an agent PRODUCES proposals + gates them, never
   stages/commits without Hleb's explicit ratification.
7. No organization_id/user_id/workspace_id/role in any tool input; tenancy is server-injected only.
8. Shipping UNVERIFIABLE code that only APPEARS to work (a stub that fabricates a result, a blind wiring
   that can't be tested) is itself a form of confident-wrong. Honest fail-closed > fake runnability.
`

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "verdict",
    "confidentWrongPath",
    "invariantViolations",
    "blockingIssues",
    "reasoning",
  ],
  properties: {
    verdict: { type: "string", enum: ["GO", "GO_WITH_CHANGES", "NO_GO"] },
    confidentWrongPath: {
      type: "string",
      description:
        'Describe any path by which this change could let a confident-wrong write auto-apply, or "none found".',
    },
    invariantViolations: {
      type: "array",
      items: { type: "string" },
      description:
        "Each safety-spine invariant this change weakens/violates (empty if none).",
    },
    blockingIssues: {
      type: "array",
      items: { type: "string" },
      description:
        "Concrete must-fix issues (correctness, domain, security, test gaps) before Hleb review.",
    },
    reasoning: {
      type: "string",
      description: "Terse rationale for the verdict.",
    },
  },
}

const prompt = (
  lens,
) => `You are an ADVERSARIAL safety reviewer for the Afframe Brain (Czech agent-native accounting).
Your job is to REFUTE the change: find any way it introduces a confident-wrong path, weakens a safety
invariant, ships unverifiable code, or is domain-incorrect. Default to skepticism. A change that "looks
fine" but you cannot positively verify is safe -> flag it.

${SPINE}

REVIEW LENS (your assigned bias): ${lens}

THE CHANGE / PLAN UNDER REVIEW:
${brief}

Read the actual repo code the brief references before ruling (you have full read/tool access; the repo is at
the workspace root). Verify claims against real code, not the brief's summary. For Czech-VAT domain claims,
reason from the ZDPH rules (KH vs Souhrnné hlášení, §92 PDP, EU place-of-supply), not from surface pattern.
Return your structured verdict. NO_GO if any invariant is weakened or a confident-wrong path exists.
GO_WITH_CHANGES if safe only after your listed blocking issues are fixed. GO only if you positively verified
it preserves the spine.`

phase("Review")
const [spine, domain] = await parallel([
  () =>
    agent(
      prompt(
        "CONFIDENT-WRONG & safety-spine integrity — hunt any auto-apply/veto/gate weakening and any unverifiable/fake-runnable code.",
      ),
      {
        label: "gate:spine-opus-xhigh",
        phase: "Review",
        model: "opus",
        effort: "xhigh",
        schema: VERDICT_SCHEMA,
      },
    ),
  () =>
    agent(
      prompt(
        "DOMAIN-CORRECTNESS & SECURITY — Czech-VAT correctness (KH/SH/§92), API-key capability soundness, tenancy, migration safety, test adequacy.",
      ),
      {
        label: "gate:domain-opus-xhigh",
        phase: "Review",
        model: "opus",
        effort: "xhigh",
        schema: VERDICT_SCHEMA,
      },
    ),
])

phase("Synthesis")
const synthesis = await agent(
  `Reconcile two independent adversarial verdicts on an Afframe Brain change into ONE ruling.
${SPINE}

SPINE reviewer (Opus 4.8 xhigh) verdict:
${JSON.stringify(spine, null, 2)}

DOMAIN reviewer (Opus 4.8 xhigh) verdict:
${JSON.stringify(domain, null, 2)}

THE CHANGE / PLAN:
${brief}

Rules: the FINAL verdict is the STRICTER of the two unless you can positively refute the stricter reviewer's
concern against real code. Any unresolved confident-wrong path or invariant violation => NO_GO. Merge the
blocking issues into one deduped, prioritized must-fix list. Be terse.`,
  {
    label: "gate:synthesis",
    phase: "Synthesis",
    model: "opus",
    effort: "xhigh",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["finalVerdict", "confidentWrongPath", "mustFix", "summary"],
      properties: {
        finalVerdict: {
          type: "string",
          enum: ["GO", "GO_WITH_CHANGES", "NO_GO"],
        },
        confidentWrongPath: { type: "string" },
        mustFix: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
      },
    },
  },
)

return { spine, domain, synthesis }
