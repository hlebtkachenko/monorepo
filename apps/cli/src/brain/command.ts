// #469 — the `afframe brain run` operator command: run one live Brain booking session (or inspect its plan).
//
// The live path is creds + `BRAIN_RUNTIME_ACTIVE=1` gated by `runLiveBrainSession` (in @workspace/intake),
// which fails closed before the SDK launcher is ever consulted. `--dry-run` runs today with NO creds — it
// builds + prints the exact tool-call plan a live run would execute, so an operator can inspect it first.
//
// The SDK-backed launcher (`./sdk-launcher`, the only `@anthropic-ai/claude-agent-sdk` import) is loaded
// LAZILY, inside the live branch, so `--dry-run` and every non-Brain command start without pulling in the SDK.

import { readFileSync, statSync } from "node:fs"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import type { Command } from "commander"
import {
  BrainHarnessNotWiredError,
  planBrainDryRun,
  runLiveBrainSession,
  type BrainDryRunInputs,
  type BrainDryRunPlan,
} from "@workspace/intake"
import { assembleLoginSections } from "@workspace/brain"
import type {
  Invoice,
  LoginContextSections,
  OperatorLoginSections,
} from "@workspace/brain"
import {
  assembleBookPlan,
  assembleOcrCapturePlan,
  renderBookPlan,
  renderOcrCapturePlan,
  type BookContext,
} from "./book"
import {
  assembleExtractPlan,
  isVisionMediaPath,
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
      "Run one live Brain booking session against the deployed REST API (via a local stdio MCP bridge). " +
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

      // Drive the plan through the shared live loop (lazy-loads the SDK, fails closed as `brain run blocked`).
      await runPlanLive(plan, "brain run")
    })

  brain
    .command("book")
    .description(
      "Book documents into a capture plan, print it for inspection, and (with confirmation) book " +
        "each. Two shapes: a FOLDER of structured exports (csv / xlsx / Pohoda dataPack XML → " +
        "extractionMethod=structured), OR a single PDF/image + --extracted <ir.json> (the IR a `brain extract` " +
        "vision-OCR pre-pass produced → extractionMethod=ocr, the W1.4 extract→book bridge). --dry-run " +
        "assembles + prints only, no creds. NOTE: periodId/seriesId/eventId are OPERATOR-SUPPLIED via " +
        "--context (like `brain run`), NOT MCP-resolved.",
    )
    .argument(
      "<path>",
      "A FOLDER of structured exports, OR a single PDF/image to book via --extracted (the OCR extract→book path)",
    )
    .requiredOption(
      "--context <path>",
      "Path to a JSON file: { sections, captureContext } (same shape as `brain run` --inputs, minus invoice)",
    )
    .option(
      "--extracted <path>",
      "Path to the IR Invoice JSON a `brain extract` run produced from the PDF/image. REQUIRED when <path> is " +
        "a single PDF/image (the OCR extract→book bridge); ignored for a folder.",
    )
    .option(
      "--dry-run",
      "Assemble + print the capture plan only; contact no endpoint (no creds needed)",
    )
    .option(
      "--yes",
      "Skip the interactive confirmation prompt on a live run (non-interactive operators)",
    )
    .action(
      async (
        path: string,
        opts: {
          context: string
          extracted?: string
          dryRun?: boolean
          yes?: boolean
        },
      ) => {
        // A single PDF/image argument routes through the OCR extract→book bridge (W1.4): its IR was already
        // produced by `brain extract`, and --extracted names that IR file. A directory keeps the structured flow.
        if (isVisionFile(path)) {
          await runOcrBook(path, opts)
          return
        }

        const ctx = readBookContext(opts.context)
        const book = assembleBookPlan(path, ctx, new Date().toISOString())

        // Print the assembled plan (the operator-inspects-then-verbatim-embed property), then run the shared
        // inspect→confirm→book tail: the ordered captureRequest bodies + operator-supplied ids + skips +
        // warnings above, then dry-run / empty / confirm / abort / live loop identical to the OCR path.
        await inspectConfirmAndBook(
          renderBookPlan(book, ctx),
          book.entries,
          opts,
        )
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
      "Actually run the extract session against the deployed REST API via a local stdio MCP bridge (needs creds)",
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

/**
 * Assemble the canonical safety spine onto an operator context (M0.2a′): the LOCKED constitution is read
 * VERBATIM from `.brain/constitution.md` (never hand-copied → cannot drift/drop), and the assembler fails
 * closed if ANY safety section is missing/blank. Applied at the operator-JSON boundary so every path
 * (`run` / `book` / `extract`) boots with the same drift-proof spine; the operator no longer supplies the
 * constitution.
 */
function withAssembledSections<T extends { sections: unknown }>(
  ctx: T,
): T & { sections: LoginContextSections } {
  return {
    ...ctx,
    sections: assembleLoginSections(ctx.sections as OperatorLoginSections),
  }
}

/** Read + shallow-validate the operator-supplied `extract` context: JUST the login-pack sections (no tenancy). */
function readExtractContext(path: string): ExtractContext {
  return withAssembledSections(
    readContextFile(path, "--context", ["sections"]),
  ) as ExtractContext
}

/** Read + shallow-validate the operator-supplied `book` context: the login-pack sections + the capture context. */
function readBookContext(path: string): BookContext {
  return withAssembledSections(
    readContextFile(path, "--context", ["sections", "captureContext"]),
  ) as BookContext
}

/** True when `path` is a single PDF/image FILE (not a directory) — the OCR extract→book bridge (W1.4) path. */
function isVisionFile(path: string): boolean {
  return !statSync(path).isDirectory() && isVisionMediaPath(path)
}

/**
 * The OCR extract→book bridge (W1.4) command flow: book a single PDF/image whose IR was already produced by
 * `brain extract`. It reads the operator `--context` (sections + captureContext) + the `--extracted` IR
 * Invoice, assembles the `extractionMethod:"ocr"` capture plan (templateId/signals carried from the extract),
 * then runs the SHARED inspect→confirm→book tail — so its dry-run / confirm / abort / live-loop wording is
 * byte-identical to the folder path. `extractionMethod` is FORCED to `"ocr"` in the bridge, so a PDF can never
 * be mislabeled `"structured"`.
 */
async function runOcrBook(
  path: string,
  opts: {
    context: string
    extracted?: string
    dryRun?: boolean
    yes?: boolean
  },
): Promise<void> {
  if (!opts.extracted) {
    // A PDF/image carries no structured records — its IR comes from `brain extract`. Fail LOUD, naming the
    // exact next step, rather than silently doing nothing.
    output.write(
      `brain book: "${path}" is a PDF/image — it has no structured records to parse. Run \`brain extract ` +
        `${path} --live\` first, save the reported IR Invoice as JSON, and pass it via --extracted <ir.json>.\n`,
    )
    process.exit(1)
  }

  const invoice = readExtractedInvoice(opts.extracted)
  const plan = assembleOcrCapturePlan(invoice, readBookContext(opts.context))

  // One-record "entries" so the shared tail below drives the OCR plan through the exact same
  // inspect→confirm→book choreography as a folder — [1/1] invoice — <locator>, then the live loop.
  await inspectConfirmAndBook(
    renderOcrCapturePlan(plan, invoice),
    [{ recordType: "invoice", sourceLocator: invoice.source_locator, plan }],
    opts,
  )
}

/** One inspected entry the shared book tail drives through the live loop (folder record or the single OCR invoice). */
interface BookTailEntry {
  recordType: string
  sourceLocator: string
  plan: BrainDryRunPlan
}

/**
 * The SHARED `book` tail — the inspect→confirm→book choreography BOTH the structured folder path and the OCR
 * bridge run, so their output stays byte-identical. It prints the already-rendered plan, honors `--dry-run`
 * (print only), early-outs on no bookable entries, requires an explicit confirmation (or `--yes`), and drives
 * each entry through the live loop with the `[i/n] <kind> — <locator>` header. Nothing auto-resolved or
 * auto-assembled is embedded without a human OK.
 */
async function inspectConfirmAndBook(
  rendered: string,
  entries: BookTailEntry[],
  opts: { dryRun?: boolean; yes?: boolean },
): Promise<void> {
  output.write(rendered)

  if (opts.dryRun) return

  if (entries.length === 0) {
    output.write("brain book: no bookable documents to run.\n")
    return
  }

  const confirmed = opts.yes || (await confirmLiveRun(entries.length))
  if (!confirmed) {
    output.write("brain book: aborted, no live run.\n")
    return
  }

  for (const [index, entry] of entries.entries()) {
    output.write(
      `\n[${index + 1}/${entries.length}] ${entry.recordType} — ${entry.sourceLocator}\n`,
    )
    await runPlanLive(entry.plan, "brain book")
  }
}

/**
 * Drive ONE inspected plan through the live loop (shared by `brain run`, the structured folder path, and the
 * OCR bridge). It fails CLOSED on the `BrainHarnessNotWiredError` — writing `${command} blocked: <message>`,
 * exiting non-zero, no stack — so the write lane can never run half-provisioned. The SDK-backed launcher is
 * lazy-loaded so non-live paths never pull in the SDK.
 */
async function runPlanLive(
  plan: BrainDryRunPlan,
  command: string,
): Promise<void> {
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
      // Fail-closed: name exactly what is unmet, stop, exit non-zero, no stack.
      output.write(`${command} blocked: ${err.message}\n`)
      process.exit(1)
    }
    throw err
  }
}

/**
 * Read + shallow-validate the `--extracted` IR Invoice file at the SYSTEM BOUNDARY. It reuses the SAME
 * `_minor`-field bigint reviver every operator JSON file shares (so the extract IR's money fields survive as
 * `bigint`, not lossy `number`s), fails LOUD on a non-object or a non-invoice `record_type`, and returns the
 * IR Invoice the OCR bridge maps to a capture. It does NOT deep-validate every field — the capture schema
 * (`CaptureAccountingDocumentRequestSchema`) is the strict boundary the request is parsed against downstream.
 */
function readExtractedInvoice(path: string): Invoice {
  const parsed: unknown = JSON.parse(
    readFileSync(path, "utf8"),
    reviveMinorBigints("--extracted"),
  )
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { record_type?: unknown }).record_type !== "invoice"
  ) {
    throw new Error(
      `--extracted file ${path} must be a JSON IR Invoice ` +
        `(an object with "record_type": "invoice", as 'brain extract' reports).`,
    )
  }
  return parsed as Invoice
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
  return withAssembledSections(
    readContextFile(path, "--inputs", [
      "invoice",
      "sections",
      "captureContext",
    ]),
  ) as BrainDryRunInputs
}
