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
import {
  assembleExtractPlan,
  renderExtractPlan,
  toDocumentBlock,
  type ExtractContext,
} from "./extract"

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

  brain
    .command("extract")
    .description(
      "LOCAL vision-OCR pre-pass: read a PDF/image and produce an IR Invoice + field-level provenance + a " +
        "layout fingerprint, using the workspace OCR template library. It runs OUTSIDE the booking sandbox and " +
        "NEVER books. The file is fed to the model as an image/document CONTENT BLOCK (not a Read tool). " +
        "--dry-run assembles + prints the session config only, no creds.",
    )
    .argument(
      "<path>",
      "The local PDF or image (png/jpg/jpeg/gif/webp) to extract",
    )
    .requiredOption(
      "--context <path>",
      "Path to a JSON file: { sections } (the login-pack safety spine; extract needs NO tenancy context)",
    )
    .option(
      "--supplier <key>",
      "Optional supplier hint (IČO or normalized name) to narrow the template lookup",
    )
    .option(
      "--dry-run",
      "Assemble + print the extract session config only; contact no endpoint (no creds needed)",
    )
    .option(
      "--live",
      "Actually run the extract session against the deployed MCP endpoint (needs creds)",
    )
    .action(
      async (
        path: string,
        opts: {
          context: string
          supplier?: string
          dryRun?: boolean
          live?: boolean
        },
      ) => {
        const ctx = readExtractContext(opts.context)
        // Read the target file's bytes HERE (trusted CLI code) and turn them into a content-block descriptor.
        // The bytes ride in the message content, NEVER through a Read tool — the extract session has none.
        const document = toDocumentBlock(
          path,
          new Uint8Array(readFileSync(path)),
        )
        const plan = assembleExtractPlan(document, ctx, opts.supplier)

        // Always PRINT the assembled session config first (default-deny tool lists, the content-block fact,
        // the fixed kickoff), so an operator sees exactly what a live run would do before it runs.
        output.write(renderExtractPlan(plan))

        if (!opts.live || opts.dryRun) return

        // Lazy-load the SDK-backed launcher only when actually running live (mirrors `run` / `book`).
        const { sdkExtractSession } = await import("./sdk-launcher")
        const mcpEndpoint = process.env.BRAIN_MCP_ENDPOINT ?? ""
        const apiKey = process.env.BRAIN_API_KEY ?? ""
        const agentSdkAuth = process.env.BRAIN_AGENT_SDK_AUTH ?? ""
        const missing = [
          ["BRAIN_MCP_ENDPOINT", mcpEndpoint],
          ["BRAIN_API_KEY", apiKey],
          ["BRAIN_AGENT_SDK_AUTH", agentSdkAuth],
        ]
          .filter(([, value]) => !value)
          .map(([name]) => name)
        if (missing.length > 0) {
          // Fail-closed: name exactly which creds are unmet, exit non-zero, no stack.
          output.write(
            `brain extract blocked: missing ${missing.join(", ")}. Set them (workspace OCR-template key) to run live.\n`,
          )
          process.exit(1)
        }

        const result = await sdkExtractSession({
          session: { sections: ctx.sections, supplierHint: opts.supplier },
          mcpEndpoint,
          apiKey,
          agentSdkAuth,
          document,
        })
        output.write(
          `\n[extract session ${result.sessionId}]\n${result.report}\n`,
        )
      },
    )
}

/**
 * [W1.3] Factory for a JSON reviver that reconstructs the IR money fields as `bigint`. Every IR money
 * value (`total_minor`, `unit_price_minor`, `base_minor`, `tax_minor`, `amount_minor`, …) is a `bigint` of
 * minor units (haléř for CZK) in TypeScript, but `JSON.parse` has no bigint literal, so a `--inputs`/
 * `--context` file carries each as the SAME representation the platform uses for Money over the wire: an
 * integer minor-unit STRING (`packages/shared` `MoneySchema` — "sent over the wire as a string to avoid JSON
 * float precision loss on amounts larger than 2^53 minor units"), reconstructed here via `BigInt(...)`
 * exactly as every IR parser builds them (`tabular.ts`, `pohoda.ts`). Without this, a `_minor` value
 * arrives as a `number` (silent precision loss past 2^53, and a type mismatch against the `bigint` field)
 * — which is why `brain run --inputs` broke on money fields while `brain book` (tabular, never JSON) did not.
 *
 * Keyed on the `_minor` suffix so it only ever touches money fields; a plain integer number is tolerated
 * (coerced via its exact string) so a hand-written fixture with `1000` works, but a non-integer or a
 * malformed string fails LOUD at the boundary rather than silently truncating a booked amount. The `flag`
 * is threaded from the caller so the boundary error names the ACTUAL flag (`--inputs` or `--context`), not
 * a hardcoded one — the same reviver backs every operator JSON file.
 */
function reviveMinorBigints(
  flag: string,
): (key: string, value: unknown) => unknown {
  return (key, value) => {
    if (!key.endsWith("_minor")) return value
    if (typeof value === "bigint") return value
    if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value)
    if (typeof value === "number" && Number.isSafeInteger(value))
      return BigInt(value)
    throw new Error(
      `${flag}: money field "${key}" must be an integer minor-unit value ` +
        `(string preferred, e.g. "150000"), got ${JSON.stringify(value)}`,
    )
  }
}

/**
 * Read + shallow-validate an operator-supplied JSON context file at a SYSTEM BOUNDARY. It fails LOUD on a
 * non-object or any missing required key (naming the flag + the exact key list), then picks ONLY the required
 * keys — any extra key in the file (e.g. a `policy` widening attempt) is DROPPED, never carried through. This
 * is the single parametric reader all three operator inputs share; each caller passes its flag label + the
 * keys it needs and gets back an object of exactly those keys, typed to the caller's shape.
 */
function readContextFile<K extends string>(
  path: string,
  flag: string,
  requiredKeys: readonly K[],
): Record<K, unknown> {
  const parsed: unknown = JSON.parse(
    readFileSync(path, "utf8"),
    reviveMinorBigints(flag),
  )
  const missing =
    typeof parsed !== "object" || parsed === null
      ? [...requiredKeys]
      : requiredKeys.filter((key) => !(key in parsed))
  if (missing.length > 0) {
    const label = requiredKeys.length === 1 ? "key" : "keys"
    throw new Error(
      `${flag} file ${path} must be a JSON object with ${label}: ${requiredKeys.join(", ")}`,
    )
  }
  const obj = parsed as Record<string, unknown>
  const picked = {} as Record<K, unknown>
  for (const key of requiredKeys) picked[key] = obj[key]
  return picked
}

/** Read + shallow-validate the operator-supplied `extract` context: JUST the login-pack sections (no tenancy). */
function readExtractContext(path: string): ExtractContext {
  return readContextFile(path, "--context", ["sections"]) as ExtractContext
}

/** Read + shallow-validate the operator-supplied `book` context: the login-pack sections + the capture context. */
function readBookContext(path: string): BookContext {
  return readContextFile(path, "--context", [
    "sections",
    "captureContext",
  ]) as BookContext
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
 * are carried through (the shared `readContextFile` picks EXACTLY the required keys) — an optional `policy`
 * (or any other key) in the file is DROPPED, so the pinned `BRAIN_ACCOUNTING_POLICY` (the default
 * `planBrainDryRun` applies) can never be widened from the inputs file. Note the tool lists are ALSO
 * server-side-defended: `resolve_accounting_held_write` / `list_accounting_held_writes` are denied for the
 * Brain's agent key via `@RequireHumanActor()` (#517); this pin closes the last client-side widening seam.
 */
export function readInputs(path: string): BrainDryRunInputs {
  return readContextFile(path, "--inputs", [
    "invoice",
    "sections",
    "captureContext",
  ]) as BrainDryRunInputs
}
