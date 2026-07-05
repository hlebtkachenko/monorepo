// #469 — the `afframe brain run` operator command: run one live Brain booking session (or inspect its plan).
//
// The live path is creds + `BRAIN_RUNTIME_ACTIVE=1` gated by `runLiveBrainSession` (in @workspace/intake),
// which fails closed before the SDK launcher is ever consulted. `--dry-run` runs today with NO creds — it
// builds + prints the exact tool-call plan a live run would execute, so an operator can inspect it first.
//
// The SDK-backed launcher (`./sdk-launcher`, the only `@anthropic-ai/claude-agent-sdk` import) is loaded
// LAZILY, inside the live branch, so `--dry-run` and every non-Brain command start without pulling in the SDK.

import { readFileSync } from "node:fs"
import { stdout as output } from "node:process"
import type { Command } from "commander"
import {
  BrainHarnessNotWiredError,
  planBrainDryRun,
  runLiveBrainSession,
  type BrainDryRunInputs,
} from "@workspace/intake"

/** Register `brain run` (+ subtree) on the CLI program. */
export function registerBrainCommand(program: Command): void {
  const brain = program
    .command("brain")
    .description("Afframe Brain operator commands (creds-gated).")

  brain
    .command("run")
    .description(
      "Run one live Brain booking session against the deployed MCP endpoint. " +
        "Needs BRAIN_RUNTIME_ACTIVE=1 + creds; --dry-run inspects the plan with no creds.",
    )
    .requiredOption(
      "--inputs <path>",
      "Path to a JSON file: { invoice, sections, captureContext }",
    )
    .option(
      "--dry-run",
      "Build + print the tool-call plan only; contact no endpoint (no creds needed)",
    )
    .action(async (opts: { inputs: string; dryRun?: boolean }) => {
      const plan = planBrainDryRun(readInputs(opts.inputs))

      if (opts.dryRun) {
        output.write(JSON.stringify(plan, null, 2) + "\n")
        return
      }

      // Lazy-load the SDK-backed launcher only when actually running live.
      const { sdkAgentSessionLauncher } = await import("./sdk-launcher")
      try {
        const result = await runLiveBrainSession({
          plan,
          mcpEndpoint: process.env.BRAIN_MCP_ENDPOINT ?? "",
          readEnv: (name) => process.env[name],
          launcher: sdkAgentSessionLauncher,
        })
        output.write(JSON.stringify(result, null, 2) + "\n")
      } catch (err) {
        if (err instanceof BrainHarnessNotWiredError) {
          // Expected fail-closed path: name exactly what is unmet, exit non-zero, no stack.
          output.write(`brain run blocked: ${err.message}\n`)
          process.exit(1)
        }
        throw err
      }
    })
}

/**
 * Read + shallow-validate the operator-supplied plan inputs. Only `invoice` / `sections` / `captureContext`
 * are carried through — an optional `policy` (or any other key) in the file is DROPPED, so the pinned
 * `BRAIN_ACCOUNTING_POLICY` (the default `planBrainDryRun` applies) can never be widened from the inputs
 * file. Note the tool lists are ALSO server-side-defended: `resolve_accounting_held_write` /
 * `list_accounting_held_writes` are denied for the Brain's agent key via `@RequireHumanActor()` (#517); this
 * pin closes the last client-side widening seam.
 */
function readInputs(path: string): BrainDryRunInputs {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("invoice" in parsed) ||
    !("sections" in parsed) ||
    !("captureContext" in parsed)
  ) {
    throw new Error(
      `--inputs file ${path} must be a JSON object with keys: invoice, sections, captureContext`,
    )
  }
  const obj = parsed as Record<string, unknown>
  return {
    invoice: obj.invoice,
    sections: obj.sections,
    captureContext: obj.captureContext,
  } as BrainDryRunInputs
}
