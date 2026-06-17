#!/usr/bin/env node
/**
 * PR title linter — local mirror of `.github/workflows/pr-title.yml`.
 *
 * Squash-merge ships ONLY the PR title to main as the single commit subject,
 * so an invalid title is a real CI failure (conv-title check). This script
 * mirrors the workflow's allow-list so the failure is caught at pre-push time
 * instead of after a GitHub Actions roundtrip.
 *
 * Usage:
 *   node scripts/check-pr-title.mjs "<title>"
 *   pnpm pr:check-title "<title>"
 *
 * Lefthook pre-push hook (lefthook.yml) wires this against
 * `git log -1 --format='%s'` — your latest commit subject is the default
 * source for `gh pr create` and the common PR-title shape.
 *
 * IMPORTANT: when you change `.github/workflows/pr-title.yml`, update the
 * three constants below to match. A drift-check ESLint rule is overkill;
 * the workflow file is short and stable, periodic manual sync is fine.
 */

const TYPES = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "chore",
  "docs",
  "test",
  "build",
  "ci",
  "style",
  "revert",
]

// Keep aligned with `scripts/governance/detect-pr-scope.mjs` — that script
// classifies PR diffs by folder; this script gates PR-title scopes against
// conventional-commit conventions. New SDK / MCP / CLI surfaces landed in
// Phase B, so allow their scope tokens here.
const SCOPES = [
  "admin",
  "ai",
  "api",
  "auth",
  "bot",
  "bundle",
  "ci",
  "cli",
  "config",
  "db",
  "deps",
  "deps-dev",
  "docs",
  "email",
  "github",
  "governance",
  "i18n",
  "infra",
  "mcp",
  "observability",
  "pdf",
  "release",
  "sdk",
  "secrets",
  "shared",
  "storage",
  "tests",
  "turbo",
  "ui",
  "web",
  "workers",
]

const SUBJECT_PATTERN = /^[a-z0-9].+$/

const title = process.argv[2]
if (!title || !title.trim()) {
  console.error("[check-pr-title] no title provided")
  console.error('usage: node scripts/check-pr-title.mjs "<title>"')
  process.exit(2)
}

// Allow Dependabot's auto-generated titles unchanged — CI conv-title also
// short-circuits on the dependabot actor.
if (/^build\(deps(-dev)?\):\s/.test(title) || /^chore\(deps\):\s/.test(title)) {
  console.log("[check-pr-title] dependabot-style title accepted")
  process.exit(0)
}

const match = title.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/)
if (!match) {
  fail(
    `Title does not match Conventional Commits shape "type(scope): subject".`,
    [
      `Got:      "${title}"`,
      `Expected: "<type>(<scope>): <subject>" or "<type>: <subject>"`,
      `Example:  "fix(auth): session cookie expiry off-by-one"`,
    ],
  )
}

const [, type, scope, , subject] = match

if (!TYPES.includes(type)) {
  fail(`Unknown type "${type}".`, [`Allowed: ${TYPES.join(", ")}`])
}

if (scope && !SCOPES.includes(scope)) {
  fail(`Unknown scope "${scope}".`, [
    `Allowed: ${SCOPES.join(", ")}`,
    `Or drop the scope: "${type}: ${subject}"`,
  ])
}

if (!SUBJECT_PATTERN.test(subject)) {
  fail(`Subject must start with a lower-case letter or digit.`, [
    `Got:      "${subject}"`,
    `Pattern:  ${SUBJECT_PATTERN}`,
    `Fix:      lower-case the first character — "${subject.charAt(0).toLowerCase()}${subject.slice(1)}"`,
  ])
}

if (title.length > 100) {
  fail(
    `Title is ${title.length} chars, max is 100 (commitlint header-max-length).`,
    [
      `Trim before pushing — long titles are usually multi-sentence; move detail to PR body.`,
    ],
  )
}

console.log(`[check-pr-title] OK: "${title}"`)
process.exit(0)

function fail(reason, hints) {
  console.error(`[check-pr-title] FAIL: ${reason}`)
  for (const h of hints) console.error(`  ${h}`)
  console.error("")
  console.error("Mirror of .github/workflows/pr-title.yml (conv-title check).")
  console.error(
    "If the rule changed in CI, update scripts/check-pr-title.mjs too.",
  )
  process.exit(1)
}
