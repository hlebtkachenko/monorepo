#!/usr/bin/env node
import { existsSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { error, log } from "node:console"
import process from "node:process"

const command = process.argv[2] ?? "ready"
const root = process.cwd()
const indexDir = join(root, ".codegraph")

function run(args, options = {}) {
  const result = spawnSync("pnpm", ["exec", "codegraph", ...args], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CODEGRAPH_TELEMETRY: "0",
    },
    ...options,
  })

  if (result.error) {
    error(result.error.message)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

// Builds the index if it is missing. Returns true when a fresh index was
// built (so callers can skip a redundant sync right after a full init).
function ensureIndex() {
  if (existsSync(indexDir)) {
    return false
  }

  log("CodeGraph index missing, building local .codegraph/ index...")
  run(["init", "."])
  return true
}

switch (command) {
  case "init":
    run(["init", "."])
    break
  case "ensure":
    ensureIndex()
    break
  case "sync":
    if (!ensureIndex()) {
      run(["sync", "."])
    }
    break
  case "status":
    if (!existsSync(indexDir)) {
      log("No CodeGraph index yet. Run `pnpm codegraph:ready` to build it.")
      break
    }
    run(["status", "."])
    break
  case "ready":
    if (!ensureIndex()) {
      run(["sync", "."])
    }
    run(["status", "."])
    break
  default:
    error(`Unknown CodeGraph command: ${command}`)
    error("Usage: node scripts/codegraph.mjs [ready|ensure|init|sync|status]")
    process.exit(1)
}
