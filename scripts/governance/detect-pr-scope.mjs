#!/usr/bin/env node
/**
 * Classify a PR diff into named scopes for `pr-checklist.yml`.
 *
 * Usage:  detect-pr-scope.mjs <base-sha> <head-sha>
 * Output: JSON array of scope keys on stdout, e.g. ["api-endpoint", "sdk"].
 *
 * Scope inference is intentionally simple — folder prefix match, no AST
 * parsing. The full mapping table lives in `docs/conventions/ENDPOINT-ADDITION.md`;
 * keep this script aligned with that table.
 */

import { spawnSync } from "node:child_process"

const [base, head] = process.argv.slice(2)
if (!base || !head) {
  process.stderr.write("usage: detect-pr-scope.mjs <base-sha> <head-sha>\n")
  process.exit(2)
}

// Validate SHA shape — git accepts short SHAs and refs, but in CI both
// arguments come from `github.event.pull_request.{base,head}.sha`
// which are always 40-char hex. Reject anything else so a hostile PR
// title or branch name cannot reach the git command via this path.
const SHA_RE = /^[0-9a-f]{7,40}$/i
if (!SHA_RE.test(base) || !SHA_RE.test(head)) {
  process.stderr.write(`refusing to run with non-SHA argv: ${base} ${head}\n`)
  process.exit(2)
}

// spawnSync with an argv array — never a shell-interpolated template
// literal — eliminates the command-injection vector even before the
// SHA-shape validation above.
const diff = spawnSync("git", ["diff", "--name-only", `${base}...${head}`], {
  encoding: "utf8",
})
if (diff.status !== 0) {
  process.stderr.write(`git diff exited ${diff.status}: ${diff.stderr}\n`)
  process.exit(1)
}
const files = (diff.stdout ?? "").split("\n").filter(Boolean)

const SCOPE_RULES = [
  {
    key: "api-endpoint",
    match: (f) => f.startsWith("packages/shared/src/api/"),
  },
  { key: "api-controller", match: (f) => f.startsWith("apps/api/src/v1/") },
  { key: "openapi-spec", match: (f) => f.startsWith("apps/api/openapi/") },
  { key: "sdk", match: (f) => f.startsWith("packages/sdk/") },
  { key: "mcp", match: (f) => f.startsWith("apps/mcp/") },
  { key: "cli", match: (f) => f.startsWith("apps/cli/") },
  { key: "auth", match: (f) => f.startsWith("packages/auth/") },
  { key: "db", match: (f) => f.startsWith("packages/db/") },
  { key: "infra", match: (f) => f.startsWith("infra/") },
  { key: "ci", match: (f) => f.startsWith(".github/") },
  { key: "ui", match: (f) => f.startsWith("packages/ui/") },
  { key: "web", match: (f) => f.startsWith("apps/web/") },
  { key: "admin", match: (f) => f.startsWith("apps/admin/") },
  { key: "adr", match: (f) => f.startsWith("docs/adr/") },
  { key: "runbook", match: (f) => f.startsWith("docs/runbooks/") },
]

const matched = new Set()
for (const file of files) {
  for (const rule of SCOPE_RULES) {
    if (rule.match(file)) matched.add(rule.key)
  }
}

process.stdout.write(
  JSON.stringify({ base, head, scopes: [...matched] }, null, 2),
)
