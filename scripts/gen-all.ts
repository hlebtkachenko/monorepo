import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * `pnpm gen:all` — single entry point for the codegen pipeline.
 *
 * Sequence (each stage halts the pipeline on non-zero exit):
 *   1. `pnpm --filter api emit:openapi` — emits `apps/api/openapi/v1.json`
 *      from the shared registry. The committed spec is the input for every
 *      downstream consumer; any registry edit must flow through here.
 *   2. `pnpm --filter @afframe/sdk gen` — `openapi-typescript` regenerates
 *      `packages/sdk/src/generated/`.
 *   3. `pnpm --filter @afframe/mcp gen` — regenerates
 *      `apps/mcp/src/tools/generated/`.
 *
 * Stages whose target package isn't scaffolded (or hasn't wired a `gen`
 * script yet) are skipped, not failed, so the pipeline grows as new
 * consumers come online. CI's `sdk-drift`, `mcp-coverage`, and
 * `openapi-lint` gates re-run this and fail on any uncommitted diff.
 */

const ROOT = resolve(__dirname, "..")

type Stage = {
  label: string
  args: string[]
  /** Package whose package.json must declare the script for this stage to
   *  run. Stages whose target hasn't been scaffolded (or wired their gen
   *  script yet) are skipped, not failed — the pipeline grows as B4/B5/C
   *  land. */
  requires?: { pkg: string; script: string }
}

const STAGES: Stage[] = [
  {
    label: "OpenAPI spec",
    args: ["--filter", "api", "emit:openapi"],
  },
  {
    label: "SDK types",
    args: ["--filter", "@afframe/sdk", "gen"],
    requires: { pkg: "packages/sdk/package.json", script: "gen" },
  },
  {
    label: "MCP tools",
    args: ["--filter", "@afframe/mcp", "gen"],
    requires: { pkg: "apps/mcp/package.json", script: "gen" },
  },
]

function run(stage: Stage): void {
  process.stdout.write(`\n▶ ${stage.label}\n  pnpm ${stage.args.join(" ")}\n`)
  const result = spawnSync("pnpm", stage.args, {
    cwd: ROOT,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    process.stderr.write(`\n✖ ${stage.label} failed (exit ${result.status})\n`)
    process.exit(result.status ?? 1)
  }
}

function hasGenScript(stage: Stage): boolean {
  if (!stage.requires) return true
  const path = resolve(ROOT, stage.requires.pkg)
  if (!existsSync(path)) return false
  try {
    const pkg = JSON.parse(readFileSync(path, "utf8")) as {
      scripts?: Record<string, string>
    }
    return Boolean(pkg.scripts?.[stage.requires.script])
  } catch {
    return false
  }
}

function main(): void {
  for (const stage of STAGES) {
    if (!hasGenScript(stage)) {
      process.stdout.write(
        `\n⏭  ${stage.label} — skipped (target not scaffolded yet)\n`,
      )
      continue
    }
    run(stage)
  }
  process.stdout.write("\n✓ gen:all complete\n")
}

main()
