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

import { execSync } from "node:child_process"

const [base, head] = process.argv.slice(2)
if (!base || !head) {
  process.stderr.write("usage: detect-pr-scope.mjs <base-sha> <head-sha>\n")
  process.exit(2)
}

const files = execSync(`git diff --name-only ${base}...${head}`, {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)

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
  { key: "docs", match: (f) => f.startsWith("apps/docs/") },
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
