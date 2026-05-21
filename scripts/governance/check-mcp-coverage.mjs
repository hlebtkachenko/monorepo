#!/usr/bin/env node
/**
 * MCP coverage check — every committed spec `operationId` must have a
 * matching file under `apps/mcp/src/tools/generated/`.
 *
 * Exit 0: every op is covered.
 * Exit 1: at least one op is missing — prints the gap list to stdout.
 *
 * Invoked from `.github/workflows/mcp-coverage.yml`. Kept here (not inline
 * in the workflow YAML) so the script can grow without bash-quoting traps.
 */

import { readFileSync, readdirSync } from "node:fs"

const SPEC_PATH = "apps/api/openapi/v1.json"
const TOOLS_DIR = "apps/mcp/src/tools/generated"
// `apps/mcp/scripts/gen-tools.ts` currently emits MCP tools only for GET
// methods — openapi-fetch requires `{ body }` as the second arg for
// POST/PUT/PATCH and the body-schema → MCP inputSchema wiring is a
// separate feature (tracked in AFF-236). Mirror that skip here so the
// coverage check fails only on missing GET tools.
const METHODS = ["get"]

const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"))
const ops = []
for (const item of Object.values(spec.paths ?? {})) {
  for (const m of METHODS) {
    if (item[m]?.operationId) ops.push(item[m].operationId)
  }
}

const generated = new Set(
  readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => f.replace(/\.ts$/, "")),
)

const missing = ops.filter((id) => !generated.has(id))
if (missing.length) {
  process.stdout.write(missing.join("\n") + "\n")
  process.exit(1)
}
