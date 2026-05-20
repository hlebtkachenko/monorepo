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
const METHODS = ["get", "post", "put", "patch", "delete"]

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
