// #469 — the `afframe brain run` operator command: run one live Brain booking session (or inspect its plan).
//
// The live path is creds + `BRAIN_RUNTIME_ACTIVE=1` gated by `runLiveBrainSession` (in @workspace/intake),
// which fails closed before the SDK launcher is ever consulted. `--dry-run` runs today with NO creds — it
// builds + prints the exact tool-call plan a live run would execute, so an operator can inspect it first.
//
// The SDK-backed launcher (`./sdk-launcher`, the only `@anthropic-ai/claude-agent-sdk` import) is loaded
// LAZILY, inside the live branch, so `--dry-run` and every non-Brain command start without pulling in the SDK.

import { readFileSync } from "node:fs"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import type { Command } from "commander"
import {
  BrainHarnessNotWiredError,
  planBrainDryRun,
  runLiveBrainSession,
  type BrainDryRunInputs,
} from "@workspace/intake"
import { assembleBookPlan, renderBookPlan, type BookContext } from "./book"

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

  brain
    .command("book")
    .description(
      "Parse a folder of structured accounting exports into a capture plan, print it for inspection, and " +
        "(with --live + confirmation) book each document. --dry-run assembles + prints only, no creds. " +
        "NOTE: periodId/seriesId/eventId are OPERATOR-SUPPLIED via --context (like `brain run`), NOT MCP-resolved.",
    )
    .argument(
      "<folder>",
      "Folder of structured accounting exports (csv / xlsx / Pohoda dataPack XML)",
    )
    .requiredOption(
      "--context <path>",
      "Path to a JSON file: { sections, captureContext } (same shape as `brain run` --inputs, minus invoice)",
    )
    .option(
      "--dry-run",
      "Assemble + print the capture plan only; contact no endpoint (no creds needed)",
    )
    .option(
      "--yes",
      "Skip the interactive confirmation prompt on a --live run (non-interactive operators)",
    )
    .action(
      async (
        folder: string,
        opts: { context: string; dryRun?: boolean; yes?: boolean },
      ) => {
        const ctx = readBookContext(opts.context)
        const book = assembleBookPlan(folder, ctx, new Date().toISOString())

        // Always PRINT the assembled plan first (the operator-inspects-then-verbatim-embed property): the
        // ordered captureRequest bodies + the operator-supplied ids + skips + warnings, before anything runs.
        output.write(renderBookPlan(book, ctx))

        if (opts.dryRun) return

        if (book.entries.length === 0) {
          output.write("brain book: no bookable documents to run.\n")
          return
        }

        // --live: the plan is printed above; require an explicit confirmation before any live session, so
        // nothing auto-resolved (periodId/seriesId/eventId) or auto-assembled is embedded without a human OK.
        const confirmed =
          opts.yes || (await confirmLiveRun(book.entries.length))
        if (!confirmed) {
          output.write("brain book: aborted, no live run.\n")
          return
        }

        // Lazy-load the SDK-backed launcher only when actually running live (mirrors `brain run`).
        const { sdkAgentSessionLauncher } = await import("./sdk-launcher")
        for (const [index, entry] of book.entries.entries()) {
          output.write(
            `\n[${index + 1}/${book.entries.length}] ${entry.recordType} — ${entry.sourceLocator}\n`,
          )
          try {
            const result = await runLiveBrainSession({
              plan: entry.plan,
              mcpEndpoint: process.env.BRAIN_MCP_ENDPOINT ?? "",
              readEnv: (name) => process.env[name],
              launcher: sdkAgentSessionLauncher,
            })
            output.write(JSON.stringify(result, null, 2) + "\n")
          } catch (err) {
            if (err instanceof BrainHarnessNotWiredError) {
              // Fail-closed: name exactly what is unmet, stop the batch, exit non-zero, no stack.
              output.write(`brain book blocked: ${err.message}\n`)
              process.exit(1)
            }
            throw err
          }
        }
      },
    )
}

/** Read + shallow-validate the operator-supplied `book` context: the login-pack sections + the capture context. */
function readBookContext(path: string): BookContext {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("sections" in parsed) ||
    !("captureContext" in parsed)
  ) {
    throw new Error(
      `--context file ${path} must be a JSON object with keys: sections, captureContext`,
    )
  }
  const obj = parsed as Record<string, unknown>
  return {
    sections: obj.sections,
    captureContext: obj.captureContext,
  } as BookContext
}

/**
 * The live-run confirmation gate. It PROMPTS (Accept/decline) on a TTY after the plan is printed; a
 * non-interactive invocation with no `--yes` is treated as DECLINE (fail-safe — never auto-run live without
 * an explicit operator OK). Returns true only on an explicit yes.
 */
async function confirmLiveRun(count: number): Promise<boolean> {
  if (!input.isTTY) {
    output.write(
      "brain book: non-interactive and no --yes — refusing to run live without confirmation.\n",
    )
    return false
  }
  const rl = createInterface({ input, output })
  const answer = (
    await rl.question(
      `Run ${count} live booking session(s) with the plan above? [y/N]: `,
    )
  )
    .trim()
    .toLowerCase()
  rl.close()
  return answer === "y" || answer === "yes"
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
