#!/usr/bin/env node
/**
 * Render a scope-aware PR checklist comment from the JSON produced by
 * `detect-pr-scope.mjs`. Writes Markdown to stdout — `pr-checklist.yml`
 * pipes it into `marocchino/sticky-pull-request-comment` so the comment
 * stays in sync as the PR evolves.
 *
 * Usage: render-checklist-comment.mjs <scope-json-file>
 */

import { readFileSync } from "node:fs"

const path = process.argv[2]
if (!path) {
  process.stderr.write("usage: render-checklist-comment.mjs <scope-json>\n")
  process.exit(2)
}
const data = JSON.parse(readFileSync(path, "utf8"))

const sections = []

if (
  data.scopes.includes("api-endpoint") ||
  data.scopes.includes("api-controller")
) {
  sections.push({
    title: "API endpoint changed",
    items: [
      "Zod schema authored in `packages/shared/src/api/<resource>.ts` with `.openapi({...})` metadata.",
      "Operation registered via `registry.registerPath({...})` in `packages/shared/src/api/registry.ts`.",
      "Nest controller in `apps/api/src/v1/<resource>/` mounted on `V1Module`.",
      "`pnpm gen:all` run; spec + SDK + MCP outputs committed.",
      "E2E test covering tenant isolation added under `apps/api/src/**/*.test.ts` or `apps/web/e2e/`.",
      "`pnpm verify` green locally.",
    ],
  })
}

if (data.scopes.includes("sdk") && !data.scopes.includes("api-endpoint")) {
  sections.push({
    title: "SDK changed",
    items: [
      "If the SDK public surface changed, document the change in `docs/api/SDK.md`.",
      "Regenerate from the spec rather than hand-editing `packages/sdk/src/generated/`.",
    ],
  })
}

if (data.scopes.includes("mcp") && !data.scopes.includes("api-endpoint")) {
  sections.push({
    title: "MCP changed",
    items: [
      "Tool annotation changes go in `apps/mcp/src/tools/_curate.ts`, never in `tools/generated/`.",
      "Regenerate via `pnpm --filter @afframe/mcp gen`.",
    ],
  })
}

if (data.scopes.includes("infra")) {
  sections.push({
    title: "Infrastructure changed",
    items: [
      "Run `pnpm --filter infra-cdk diff` and paste relevant output in the PR description.",
      "AWS Budget changes get extra scrutiny — see `docs/runbooks/COST-INCIDENT-RESPONSE.md`.",
      "Confirm Cloudflare Tunnel ingress rules align with `docs/DOMAINS-AND-EMAIL.md`.",
    ],
  })
}

if (data.scopes.includes("db")) {
  sections.push({
    title: "Database changed",
    items: [
      "Migration filename matches `NNNN_<snake>.sql`.",
      "If a tenant-scoped table was added, FORCE RLS policy is present and tested.",
      "`pnpm --filter @workspace/db test` green.",
    ],
  })
}

const header =
  "## PR scope checklist\n\n_Scope-aware checklist generated from the PR diff. Tick what applies; CI gates the rest._\n"

const body = sections.length
  ? sections
      .map(
        (s) =>
          `### ${s.title}\n\n${s.items.map((i) => `- [ ] ${i}`).join("\n")}\n`,
      )
      .join("\n")
  : "_No scopes detected — small PR. Make sure `pnpm verify` passes._\n"

const footer =
  "\n---\n" +
  `_Scopes: \`${data.scopes.join("`, `") || "(none)"}\`_\n` +
  "_See `docs/conventions/ENDPOINT-ADDITION.md` and `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`._\n"

process.stdout.write(header + "\n" + body + footer)
