/* eslint-disable no-undef -- agent/parallel/phase/log/args/budget are Workflow-tool runtime globals */
export const meta = {
  name: "thermo-review",
  description:
    "Thermo-nuclear code-quality review — Opus 4.8 xhigh reviewers hunt structural simplification / code-judo / spaghetti / boundary problems in the branch diff",
  whenToUse:
    "Strict maintainability audit of a branch diff. Pass the diff scope + file list as args.",
  phases: [
    { title: "Review", detail: "Opus 4.8 xhigh, 3 lenses, independent" },
    {
      title: "Synthesis",
      detail: "Opus 4.8 xhigh ranks high-conviction findings",
    },
  ],
}

const brief = typeof args === "string" ? args : JSON.stringify(args, null, 2)

const STANDARDS = `
THERMO-NUCLEAR STANDARDS (be ambitious; prefer DELETING complexity over rearranging it):
0. Code-judo: reframe so whole branches/helpers/modes/layers disappear. Make the change feel inevitable.
1. No file crosses 1000 lines because of this PR without a very strong reason.
2. No random spaghetti: new ad-hoc conditionals / one-off branches bolted into unrelated flows are a design problem.
3. Clean the design, don't just accept working code. Remove moving pieces, don't spread complexity.
4. Prefer direct/boring/maintainable over hacky/magical. Flag thin wrappers, identity abstractions, generic
   mechanisms that hide simple structure, hand-rolled parsers where a canonical tool exists.
5. Type/boundary cleanliness: question needless optionality / unknown / any / casts / silent fallbacks.
6. Canonical layer + reuse existing helpers; no bespoke near-duplicates; logic in the right package.
7. Avoid needless sequential orchestration / non-atomic updates when a cleaner structure is obvious.
Do NOT flood with nits. High-conviction structural findings only. Do NOT weaken any safety/security behavior
(this is a Brain safety PR: the three-way AND, cold-start block, agent-key denies, fail-closed seam must stay).`

const FINDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "findings"],
  properties: {
    verdict: { type: "string", enum: ["CLEAN", "MINOR", "NEEDS_WORK"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "file",
          "severity",
          "problem",
          "remedy",
          "behaviorPreserving",
        ],
        properties: {
          file: { type: "string" },
          severity: {
            type: "string",
            enum: ["blocker", "strong", "nice-to-have"],
          },
          problem: { type: "string" },
          remedy: {
            type: "string",
            description: "Concrete code-judo move / restructuring.",
          },
          behaviorPreserving: {
            type: "boolean",
            description:
              "True if the remedy keeps behavior identical (incl. all safety/security semantics).",
          },
        },
      },
    },
  },
}

const prompt = (
  lens,
) => `Thermo-nuclear code-quality review of a branch diff. Be direct, serious, demanding.
${STANDARDS}

YOUR LENS: ${lens}

SCOPE: ${brief}

Read the real files in the diff (git range given). Rank by structural impact. For each finding give a
CONCRETE remedy (the actual restructuring, not "consider cleaning"). Mark whether it preserves behavior +
all safety semantics. Ignore the doc/runbook prose and one-line test-mock actorKind additions unless they
signal a real structural problem. Return your structured verdict.`

phase("Review")
const [simpl, boundary, canon] = await parallel([
  () =>
    agent(
      prompt(
        "SIMPLIFICATION & code-judo: the gated-write-seams boundary test scanner (hand-rolled comment/string stripper + brace-depth arg counter) — is there a dramatically simpler canonical approach (TS AST / existing helper)? Any branch/helper that could disappear entirely?",
      ),
      {
        label: "thermo:simplify",
        phase: "Review",
        model: "opus",
        effort: "xhigh",
        schema: FINDING_SCHEMA,
      },
    ),
  () =>
    agent(
      prompt(
        "SPAGHETTI & boundary/type: the audit-stamp derivation (nested ternary in accounting-writes.gate.ts), the two agent-deny blocks in held-writes.controller.ts, the actorKind narrowing + required-field threading — duplicate branches, ad-hoc conditionals, needless optionality/fallback?",
      ),
      {
        label: "thermo:spaghetti",
        phase: "Review",
        model: "opus",
        effort: "xhigh",
        schema: FINDING_SCHEMA,
      },
    ),
  () =>
    agent(
      prompt(
        "CANONICAL-LAYER & abstraction: the intake AgentSessionLauncher seam + the accounting KH/DPH euFilter edits + the api_key.actor_kind column — is logic in the right layer? thin wrappers? bespoke duplicates of existing helpers? Should the agent-deny be a reusable NestJS guard/decorator rather than inline checks?",
      ),
      {
        label: "thermo:canonical",
        phase: "Review",
        model: "opus",
        effort: "xhigh",
        schema: FINDING_SCHEMA,
      },
    ),
])

phase("Synthesis")
const synthesis = await agent(
  `Merge three thermo-nuclear reviews into ONE ranked, deduped, high-conviction list. Drop nits and any
finding that would weaken safety/security behavior. Keep only structural findings worth acting on tonight.
${STANDARDS}

SIMPLIFY: ${JSON.stringify(simpl, null, 2)}
SPAGHETTI: ${JSON.stringify(boundary, null, 2)}
CANONICAL: ${JSON.stringify(canon, null, 2)}

SCOPE: ${brief}

Return the final ranked must-fix list (blockers + strong first), each with a concrete behavior-preserving
remedy, plus an overall verdict.`,
  {
    label: "thermo:synthesis",
    model: "opus",
    effort: "xhigh",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["overallVerdict", "mustFix", "summary"],
      properties: {
        overallVerdict: {
          type: "string",
          enum: ["CLEAN", "MINOR", "NEEDS_WORK"],
        },
        mustFix: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["file", "severity", "problem", "remedy"],
            properties: {
              file: { type: "string" },
              severity: {
                type: "string",
                enum: ["blocker", "strong", "nice-to-have"],
              },
              problem: { type: "string" },
              remedy: { type: "string" },
            },
          },
        },
        summary: { type: "string" },
      },
    },
  },
)

return { simpl, boundary, canon, synthesis }
