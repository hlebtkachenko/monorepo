#!/usr/bin/env node
/**
 * lefthook pre-push hook — endpoint-addition checklist.
 *
 * Fires when files changed across the codegen seam (the shared registry, an
 * api controller, the committed OpenAPI spec, or a generated SDK / MCP
 * output). Verifies the operator ran `pnpm gen:all` after editing the
 * upstream — if the registry or a controller moved but the generated outputs
 * didn't, the push almost certainly missed step 4 of the endpoint-addition
 * runbook.
 *
 * The full 7-step checklist lives in
 * `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`. This script only enforces
 * the codegen step, which is also covered by CI's `sdk-drift` and
 * `mcp-coverage` workflows — running it locally saves the GitHub roundtrip.
 *
 * Invocation: lefthook passes the file list as positional args. The hook
 * exits 0 if (a) no upstream files changed, or (b) upstream changed *and*
 * the generated outputs are present in the push.
 */

const files = process.argv.slice(2)
if (files.length === 0) process.exit(0)

const upstreamPrefixes = [
  "packages/shared/src/api/",
  "apps/api/src/v1/",
  "apps/api/openapi/",
]
const generatedPrefixes = [
  "packages/sdk/src/generated/",
  "apps/mcp/src/tools/generated/",
]

const upstreamTouched = files.some((f) =>
  upstreamPrefixes.some((p) => f.startsWith(p)),
)
const generatedTouched = files.some((f) =>
  generatedPrefixes.some((p) => f.startsWith(p)),
)

if (!upstreamTouched) process.exit(0)
if (generatedTouched) process.exit(0)

process.stderr.write(
  [
    "[lefthook endpoint-checklist] FAIL: upstream API surface changed but the",
    "generated outputs (packages/sdk/src/generated/, apps/mcp/src/tools/generated/)",
    "are not in this push. Run `pnpm gen:all` and stage the regenerated files.",
    "",
    "Full checklist: docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md",
    "",
  ].join("\n"),
)
process.exit(1)
