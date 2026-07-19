/* eslint-disable no-undef -- agent/parallel/pipeline/phase/log/args are Workflow-tool runtime globals */
export const meta = {
  name: "thermo-review",
  description:
    "Adaptive code / security / bug reviewer. A cheap scout scopes the diff (codegraph in a monorepo, hunks elsewhere) and writes one context packet; harm-category lenses (correctness + security + maintainability) review it; findings are deduped and adversarially verified; a gate ranks only the survivors. Token-efficient: broad reading happens once at a cheap tier, deep tiers run only where wrongness is costly.",
  whenToUse:
    "Rigorous review of a branch diff for real bugs, security holes, and maintainability. Monorepo-tuned when in the monorepo, generic elsewhere. Pass the git range / file list / focus as args.",
  phases: [
    {
      title: "Scope",
      detail: "Sonnet med — detect repo, tag risk, build one scoped packet",
    },
    {
      title: "Review",
      detail:
        "harm-category lenses: correctness+security Opus xhigh (gated), maintainability Opus high",
    },
    {
      title: "Verify",
      detail: "Haiku dedup, then adversarial verify (routed Opus/Sonnet)",
    },
    {
      title: "Gate",
      detail: "Opus high — rank verified survivors, one verdict",
    },
  ],
}

const brief =
  typeof args === "string"
    ? args
    : args
      ? JSON.stringify(args, null, 2)
      : "(no scope given — default to the base-branch diff)"

// ---------------------------------------------------------------- schemas
const FINDING_ITEM = {
  type: "object",
  additionalProperties: false,
  required: [
    "file",
    "line",
    "category",
    "severity",
    "problem",
    "remedy",
    "evidence",
    "behaviorPreserving",
  ],
  properties: {
    file: { type: "string" },
    line: {
      type: "string",
      description: "line number or symbol name the finding anchors to",
    },
    category: { type: "string", enum: ["bug", "security", "maintainability"] },
    severity: { type: "string", enum: ["blocker", "strong", "nice-to-have"] },
    problem: { type: "string" },
    remedy: {
      type: "string",
      description: 'Concrete fix / code-judo move, not "consider cleaning".',
    },
    evidence: {
      type: "string",
      description:
        "Concrete grounding: call path, file:line chain, or repro. Required for blocker/strong.",
    },
    behaviorPreserving: {
      type: "boolean",
      description:
        "True if the remedy keeps behavior identical (incl. all safety/security semantics).",
    },
  },
}

const MANIFEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "mode",
    "hasCodegraph",
    "diffRange",
    "files",
    "securitySurface",
    "brainTouched",
    "packetPath",
  ],
  properties: {
    mode: { type: "string", enum: ["monorepo", "generic"] },
    hasCodegraph: { type: "boolean" },
    diffRange: { type: "string" },
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "kind", "riskTags"],
        properties: {
          path: { type: "string" },
          kind: {
            type: "string",
            enum: ["source", "test", "docs", "config", "generated"],
          },
          riskTags: { type: "array", items: { type: "string" } },
        },
      },
    },
    securitySurface: { type: "boolean" },
    brainTouched: { type: "boolean" },
    packetPath: {
      type: "string",
      description: "absolute path to the written context-packet file",
    },
    notes: { type: "string" },
  },
}

const LENS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "findings"],
  properties: {
    verdict: { type: "string", enum: ["CLEAN", "MINOR", "NEEDS_WORK"] },
    findings: { type: "array", items: FINDING_ITEM },
  },
}

const DEDUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: { candidates: { type: "array", items: FINDING_ITEM } },
}

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "reason"],
  properties: {
    status: {
      type: "string",
      enum: ["confirmed", "killed", "unverified"],
      description:
        'killed requires a concrete disproof; "can\'t confirm" is unverified, never killed',
    },
    reason: {
      type: "string",
      description: "evidence for confirm, or the disproof for kill",
    },
  },
}

const GATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overallVerdict", "mustFix", "summary"],
  properties: {
    overallVerdict: { type: "string", enum: ["CLEAN", "MINOR", "NEEDS_WORK"] },
    mustFix: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "file",
          "line",
          "category",
          "severity",
          "problem",
          "remedy",
          "behaviorPreserving",
        ],
        properties: {
          file: { type: "string" },
          line: { type: "string" },
          category: {
            type: "string",
            enum: ["bug", "security", "maintainability"],
          },
          severity: {
            type: "string",
            enum: ["blocker", "strong", "nice-to-have"],
          },
          problem: { type: "string" },
          remedy: { type: "string" },
          behaviorPreserving: { type: "boolean" },
        },
      },
    },
    summary: { type: "string" },
  },
}

// ---------------------------------------------------------------- standing rules
const STANDARDS = `THERMO-NUCLEAR MAINTAINABILITY STANDARDS (be ambitious; prefer DELETING complexity over rearranging it):
0. Code-judo: reframe so whole branches/helpers/modes/layers disappear. Make the change feel inevitable.
1. No file crosses 1000 lines because of this PR without a very strong reason.
2. No random spaghetti: new ad-hoc conditionals / one-off branches bolted into unrelated flows.
3. Clean the design, don't just accept working code. Remove moving pieces, don't spread complexity.
4. Prefer direct/boring/maintainable over hacky/magical. Flag thin wrappers, identity abstractions, generic mechanisms that hide simple structure, hand-rolled parsers where a canonical tool exists.
5. Type/boundary cleanliness: question needless optionality / unknown / any / casts / silent fallbacks.
6. Canonical layer + reuse existing helpers; no bespoke near-duplicates; logic in the right package.
7. Avoid needless sequential orchestration / non-atomic updates when a cleaner structure is obvious.
High-conviction structural findings only. Never propose a change that weakens any safety/security behavior.`

const BRAIN_INVARIANTS = `Standing Brain / accounting invariants that MUST hold (wrong here = real financial harm): the accounting write-gate is fail-closed; held writes stay held until explicitly released; audit stamps are always derived and never spoofable; VAT/DPH/EU-filter math is correct; tenant/RLS isolation holds; AI-tool request schemas never accept organization_id / user_id / workspace_id / role.`

// ================================================================ Phase 0: Scope
phase("Scope")
const manifest = await agent(
  `You are the SCOPE SCOUT for a multi-agent code review. Do reconnaissance and build ONE scoped context packet the review lenses will read. Work fast and deterministically — this is the only broad-reading step.

SCOPE INPUT (may be a git range, a file list, or free-text focus): ${brief}

Steps:
1. Repo root: \`git rev-parse --show-toplevel\`. Detect:
   - mode = "monorepo" if pnpm-workspace.yaml OR turbo.json OR nx.json exists at root; else "generic".
   - hasCodegraph = a .codegraph/ dir exists at or above the root.
   - brainTouched = the diff touches packages/brain/** (monorepo only).
2. Resolve the diff range. If SCOPE names a range/branch, use it. Else default to \`<base>...HEAD\` where <base> = the origin default branch (\`git symbolic-ref refs/remotes/origin/HEAD\`, fallback origin/main); under Conductor use $CONDUCTOR_DEFAULT_BRANCH if set. \`git fetch -q origin <base>\` first if needed.
3. \`git diff --name-status <range>\`. Classify each changed file's kind:
   source | test (*.test.*, *.spec.*, __tests__/) | docs (*.md, docs/**) | config (*.json/yml/toml, lockfiles, *.config.*) | generated (generated/**, *.gen.*, openapi clients, any codegen output dir).
4. riskTags per file by DETERMINISTIC path rules (not judgment):
   monorepo — brain: packages/brain/** · auth: apps/api/** guards|auth|middleware · db: packages/db|migrations|*.sql|RLS · money: path matches Money|Fx|VAT|DPH|invoice|ledger · apikey: api_key|apiKey|token|secret.
   generic — auth: auth|login|session|jwt|password|crypto · injection: sql|query|exec|eval|deserialize|template · input: request|body|params|upload|parse · secret: secret|token|key|credential.
   securitySurface = true if ANY changed source/config file carries an auth/db/injection/input/secret/apikey tag OR sits under api|server|middleware. Bias toward true; only pure docs/asset/story/UI-copy diffs are false.
5. Build the CONTEXT PACKET — verbatim, line-numbered source of the CHANGED symbols PLUS their callers / blast radius:
   - monorepo + hasCodegraph: use \`codegraph_explore\` (projectPath = repo root) per impacted area to get touched symbols, their callers, and blast radius. Prefer this over raw file reads.
   - else: \`git diff -U25 <range>\` for symbol-context hunks; for any changed symbol whose enclosing function/class is bigger than the hunk, Read the enclosing block so NO symbol is truncated.
   NEVER include a changed symbol without its enclosing definition and at least its direct callers. Excerpt fidelity is load-bearing — everything downstream reasons over this packet.
6. Write the packet to \`/tmp/thermo-packet-<short-sha>.md\` (short-sha = \`git rev-parse --short HEAD\`). Return its absolute path as packetPath.

Return the manifest (mode, hasCodegraph, diffRange, files[], securitySurface, brainTouched, packetPath, notes). Keep the manifest compact — the heavy content lives in the packet file, not in the manifest.`,
  {
    label: "scout",
    phase: "Scope",
    model: "sonnet",
    effort: "medium",
    agentType: "general-purpose",
    schema: MANIFEST_SCHEMA,
  },
)
if (!manifest) return { error: "scope scout failed — nothing reviewed" }
log(
  `mode=${manifest.mode} · files=${manifest.files.length} · security=${manifest.securitySurface} · brain=${manifest.brainTouched} · codegraph=${manifest.hasCodegraph}`,
)

const ciSuppression =
  manifest.mode === "monorepo"
    ? "CI already runs typecheck, lint, `turbo boundaries`, spectral, check:pr-title and brain-eval — do NOT report anything those gates catch; find what they miss."
    : "Do not report pure formatting/style a linter would catch."

const lensHeader = (
  lens,
  extra,
) => `You are ONE lens of a multi-agent code review. Direct, high-conviction, no nits.

REVIEW MODE: ${manifest.mode}${manifest.brainTouched ? " · Brain/accounting code touched (financial-harm risk)" : ""}
DIFF RANGE: ${manifest.diffRange}
CONTEXT PACKET (verbatim scoped source — READ THIS FILE FIRST): ${manifest.packetPath}
CHANGED FILES: ${JSON.stringify(manifest.files)}

The packet is your starting point, not the whole truth. You MAY Read/Grep/codegraph_explore to follow a lead, but NEVER assert a finding about code you have not actually seen. ${ciSuppression}

YOUR LENS: ${lens}
${extra}

For each finding return: file, line (or symbol), category, severity (blocker/strong/nice-to-have), the problem, a CONCRETE remedy, evidence (call path / file:line chain / repro — REQUIRED for blocker & strong), and whether the remedy preserves behavior + all safety/security semantics. Do not flood with nits. Return the structured verdict.`

// ================================================================ Phase 1: Review
phase("Review")
const skippedLenses = []
const hasSource = manifest.files.some((f) => f.kind === "source")
const lensThunks = []

// correctness — always
lensThunks.push(() =>
  agent(
    lensHeader(
      "CORRECTNESS & BUGS: broken invariants, wrong branch/condition logic, off-by-one, unhandled error/edge paths, races, non-atomic or partial updates, data loss, incorrect results.",
      manifest.brainTouched ? BRAIN_INVARIANTS : "",
    ),
    {
      label: "lens:correctness",
      phase: "Review",
      model: "opus",
      effort: "xhigh",
      agentType: "general-purpose",
      schema: LENS_SCHEMA,
    },
  ),
)

// security — gated on surface
if (manifest.securitySurface) {
  lensThunks.push(() =>
    agent(
      lensHeader(
        "SECURITY: authN/authZ bypass, injection (SQL/command/template), tenant-isolation escape, secret/credential handling, unsafe deserialization, SSRF, trust-boundary violations, privilege escalation. Assume a hostile caller.",
        manifest.brainTouched ? BRAIN_INVARIANTS : "",
      ),
      {
        label: "lens:security",
        phase: "Review",
        model: "opus",
        effort: "xhigh",
        agentType: "general-purpose",
        schema: LENS_SCHEMA,
      },
    ),
  )
} else {
  skippedLenses.push("security (no security surface in diff)")
}

// maintainability — any code diff
if (hasSource) {
  lensThunks.push(() =>
    agent(
      lensHeader("MAINTAINABILITY & STRUCTURE (code-judo).\n" + STANDARDS, ""),
      {
        label: "lens:maintainability",
        phase: "Review",
        model: "opus",
        effort: "high",
        agentType: "general-purpose",
        schema: LENS_SCHEMA,
      },
    ),
  )
} else {
  skippedLenses.push("maintainability (no source files in diff)")
}

const reviews = (await parallel(lensThunks)).filter(Boolean)
const allFindings = reviews.flatMap((r) => r.findings || [])
log(
  `lenses ran=${reviews.length} skipped=[${skippedLenses.join(", ")}] raw findings=${allFindings.length}`,
)

if (allFindings.length === 0) {
  return {
    mode: manifest.mode,
    brainTouched: manifest.brainTouched,
    securitySurface: manifest.securitySurface,
    skippedLenses,
    counts: { raw: 0, candidates: 0, confirmed: 0 },
    synthesis: {
      overallVerdict: "CLEAN",
      mustFix: [],
      summary: "No findings from the review lenses.",
    },
  }
}

// ================================================================ Phase 2: Verify
phase("Verify")
const deduped = await agent(
  `Merge findings from ${reviews.length} review lenses into ONE deduplicated candidate list. Cluster findings with the same root cause (same file + nearby line, or the same underlying defect) into a single candidate, keeping the strongest severity and the clearest problem/remedy/evidence. Do NOT invent findings. Drop only exact/near duplicates.

FINDINGS: ${JSON.stringify(allFindings)}

Return { candidates: [...] } using the finding shape.`,
  {
    label: "dedup",
    phase: "Verify",
    model: "haiku",
    effort: "medium",
    schema: DEDUP_SCHEMA,
  },
)
const candidates = deduped?.candidates ?? allFindings

const passthrough = candidates
  .filter((c) => c.severity === "nice-to-have")
  .map((c) => ({
    ...c,
    verified: "unverified",
    verifyReason: "nice-to-have — not adversarially verified",
  }))
const toVerify = candidates
  .filter((c) => c.severity !== "nice-to-have")
  .slice(0, 12)
if (candidates.filter((c) => c.severity !== "nice-to-have").length > 12)
  log(
    `NOTE: ${candidates.filter((c) => c.severity !== "nice-to-have").length - 12} blocker/strong candidates beyond the verify cap of 12 were dropped from verification.`,
  )

const verified = (
  await pipeline(toVerify, async (c) => {
    const hard = c.severity === "blocker" || manifest.brainTouched
    const v = await agent(
      `Adversarially verify ONE code-review finding. Try HARD to REFUTE it. Killing it requires a CONCRETE disproof (prove the path is unreachable, prove an existing guard preserves behavior, prove the claim contradicts the real code). If you cannot confirm AND cannot disprove, return "unverified" — never "killed" on mere doubt. Confirming requires concrete evidence (a call path / file:line chain / repro).

CONTEXT PACKET (read for grounding): ${manifest.packetPath}
You may Read/Grep/codegraph_explore the real code. Do not assert about code you have not seen.

FINDING: ${JSON.stringify(c)}

Return { status: confirmed | killed | unverified, reason }.`,
      {
        label: `verify:${c.category}:${c.file}`,
        phase: "Verify",
        model: hard ? "opus" : "sonnet",
        effort: hard ? "xhigh" : "high",
        agentType: "general-purpose",
        schema: VERDICT_SCHEMA,
      },
    )
    return {
      ...c,
      verified: v?.status ?? "unverified",
      verifyReason: v?.reason ?? "verifier returned nothing",
    }
  })
).filter(Boolean)

const surviving = [
  ...verified.filter((v) => v.verified !== "killed"),
  ...passthrough,
]
const confirmedCount = surviving.filter(
  (s) => s.verified === "confirmed",
).length
log(
  `candidates=${candidates.length} verified=${verified.length} confirmed=${confirmedCount} killed=${verified.filter((v) => v.verified === "killed").length}`,
)

if (surviving.length === 0) {
  return {
    mode: manifest.mode,
    brainTouched: manifest.brainTouched,
    securitySurface: manifest.securitySurface,
    skippedLenses,
    counts: {
      raw: allFindings.length,
      candidates: candidates.length,
      confirmed: 0,
    },
    synthesis: {
      overallVerdict: "CLEAN",
      mustFix: [],
      summary:
        "All candidate findings were refuted under adversarial verification.",
    },
  }
}

// ================================================================ Phase 3: Gate
phase("Gate")
const synthesis = await agent(
  `You are the final GATE of a multi-agent code review. Produce the ranked must-fix list from these VERIFIED findings. Rank blockers and strong first; a "confirmed" finding outranks an "unverified" one of equal severity. NEVER include a finding marked killed. NEVER propose a remedy that weakens safety/security. High-conviction and actionable only.

MODE: ${manifest.mode} · BRAIN: ${manifest.brainTouched} · SECURITY-SURFACE: ${manifest.securitySurface} · SKIPPED LENSES: [${skippedLenses.join(", ") || "none"}]
VERIFIED FINDINGS: ${JSON.stringify(surviving)}

Return overallVerdict, mustFix[] (each: file, line, category, severity, problem, concrete remedy, behaviorPreserving), and a short summary. If lenses were skipped, say so in the summary.`,
  {
    label: "gate",
    phase: "Gate",
    model: "opus",
    effort: "high",
    schema: GATE_SCHEMA,
  },
)

return {
  mode: manifest.mode,
  brainTouched: manifest.brainTouched,
  securitySurface: manifest.securitySurface,
  skippedLenses,
  counts: {
    raw: allFindings.length,
    candidates: candidates.length,
    confirmed: confirmedCount,
  },
  synthesis,
}
