// #469 — the `afframe brain run` operator command: run one live Brain booking session (or inspect its plan).
//
// The live path is creds-gated by `runLiveBrainSession` (in @workspace/intake), which fails closed before the
// SDK launcher is ever consulted. `--dry-run` runs today with NO creds — it builds + prints the exact
// tool-call plan a live run would execute, so an operator can inspect it first.
//
// [M0.2a] Env-collapse: a fresh session needs ONLY `BRAIN_API_KEY` pasted in. `resolveBrainEnv` (./env)
// defaults `BRAIN_MCP_ENDPOINT` to the production REST base and `BRAIN_AGENT_SDK_AUTH` to `"ambient"` when
// unset. The client no longer pre-blocks on `BRAIN_RUNTIME_ACTIVE` / `BRAIN_LIVE` — the SERVER admission lane
// is the real authority and every write still HELDs there; the client always attempts, the server decides. An
// admission-refused / lane-off run surfaces as `LANE_OFF_MESSAGE` (./session-config), not a raw 429.
//
// The SDK-backed launcher (`./sdk-launcher`, the only `@anthropic-ai/claude-agent-sdk` import) is loaded
// LAZILY, inside the live branch, so `--dry-run` and every non-Brain command start without pulling in the SDK.

import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import type { Command } from "commander"
import {
  BRAIN_HARNESS_REQUIRED_ENV,
  BrainHarnessNotWiredError,
  planBrainDryRun,
  planForPosting,
  runLiveBrainSession,
  type BrainDryRunInputs,
  type BrainDryRunPlan,
  type BrainSessionPlan,
  type IrToEventContext,
  type OnboardingPlan,
  type PostingSessionContext,
} from "@workspace/intake"
import { createAfframeClient } from "@afframe/sdk"
import type { CreateAccountingEventRequest } from "@workspace/shared/api"
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
import { resolveBrainEnv, type BrainEnv } from "./env"
import {
  deriveIdempotencyKey,
  renderBatchSummary,
  runBatch,
  type BatchJob,
} from "./batch"
import { liveBookOne } from "./batch-live"
import { FileCheckpointStore } from "./checkpoint-store"
import {
  assembleExtractPlan,
  isVisionMediaPath,
  renderExtractPlan,
  toDocumentBlock,
  type ExtractContext,
} from "./extract"
import {
  executeOnboardingPlan,
  fetchOnboardingPlan,
  renderOnboardingExecuteResults,
  renderOnboardingPlan,
} from "./onboard"
import {
  buildEventProposal,
  eventIdempotencyKey,
  executeEventCreate,
  renderEventProposal,
  renderEventResult,
} from "./event"
import { classifyExtractionEngine } from "./extraction-engine"
import { tryExtractTextLayer } from "./markitdown-adapter"
import { renderLiveResult } from "./session-config"

/** Register `brain run` (+ subtree) on the CLI program. */
export function registerBrainCommand(program: Command): void {
  const brain = program
    .command("brain")
    .description("Afframe Brain operator commands (creds-gated).")

  brain
    .command("run")
    .description(
      "Run one live Brain booking session against the deployed REST API (via a local stdio MCP bridge). " +
        "Needs only BRAIN_API_KEY (BRAIN_MCP_ENDPOINT/BRAIN_AGENT_SDK_AUTH default; the server admission " +
        "lane, not the client, decides whether the write lane is open); --dry-run inspects the plan with no creds.",
    )
    .requiredOption(
      "--inputs <path>",
      "Path to a JSON file. capture (default): { invoice, sections, captureContext }. posting: " +
        "{ invoice, sections, posting } where posting = { periodId, summaryRecordId, accountingEventId, " +
        "postingDate, conversationId }",
    )
    .option(
      "--mode <mode>",
      "capture (default): propose a capture write. posting: the model REASONS the double-entry účet " +
        "předkontace (which cost account 501/518/… against 321 + 343) and proposes a posting — its account " +
        "choice is the thing under test (GAP-007). Still HELD by the server gate at cold start.",
      "capture",
    )
    .option(
      "--dry-run",
      "Build + print the tool-call plan only; contact no endpoint (no creds needed)",
    )
    .action(
      async (opts: { inputs: string; mode?: string; dryRun?: boolean }) => {
        const mode = opts.mode ?? "capture"
        if (mode !== "capture" && mode !== "posting") {
          output.write(
            `brain run: unknown --mode "${mode}" (expected "capture" or "posting").\n`,
          )
          process.exit(1)
        }

        let plan: BrainSessionPlan
        if (mode === "posting") {
          const inp = readPostingInputs(opts.inputs)
          plan = planForPosting(inp.invoice, inp.sections, inp.posting)
        } else {
          plan = planBrainDryRun(readInputs(opts.inputs))
        }

        if (opts.dryRun) {
          // The posting plan carries the raw IR invoice, whose `_minor` money fields are `bigint` (which
          // `JSON.stringify` cannot serialize) — render them as their exact string, the same wire form Money
          // uses. Harmless for the capture plan (it carries no bigints).
          output.write(
            JSON.stringify(
              plan,
              (_key, value) =>
                typeof value === "bigint" ? value.toString() : value,
              2,
            ) + "\n",
          )
          return
        }

        // Drive the plan through the shared live loop (lazy-loads the SDK, fails closed as `brain run blocked`).
        await runPlanLive(plan, "brain run")
      },
    )

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
    .command("book-batch")
    .description(
      "Bulk-book a FOLDER of many structured exports through the single-document live path, with bounded " +
        "concurrency, 429 retry/backoff, and crash-safe resume. Each document gets a DETERMINISTIC " +
        "idempotency key (content hash), so a killed-and-resumed run skips already-booked documents and the " +
        "server dedups any re-book into a replay — never a double-book. --dry-run assembles + prints the " +
        "plan + keys only, no creds. Like `book`, periodId/seriesId/eventId are OPERATOR-SUPPLIED via --context.",
    )
    .argument(
      "<folder>",
      "A FOLDER of structured exports (csv / xlsx / Pohoda dataPack XML)",
    )
    .requiredOption(
      "--context <path>",
      "Path to a JSON file: { sections, captureContext } (same shape as `brain book` --context)",
    )
    .option(
      "--concurrency <n>",
      "Max live sessions in flight (default env BRAIN_BOOK_CONCURRENCY or 8)",
    )
    .option(
      "--max-attempts <n>",
      "Max attempts per document before a rate-limited doc is recorded failed (default 5)",
    )
    .option(
      "--checkpoint <path>",
      "Checkpoint file for crash-safe resume (default <folder>/.afframe-book-checkpoint.json)",
    )
    .option(
      "--dry-run",
      "Assemble + print the plan + per-document idempotency keys only; contact no endpoint (no creds needed)",
    )
    .option(
      "--yes",
      "Skip the interactive confirmation prompt on a live batch (non-interactive operators)",
    )
    .action(
      async (
        folder: string,
        opts: {
          context: string
          concurrency?: string
          maxAttempts?: string
          checkpoint?: string
          dryRun?: boolean
          yes?: boolean
        },
      ) => {
        await runBookBatch(folder, opts)
      },
    )

  brain
    .command("extract")
    .description(
      "LOCAL vision-OCR pre-pass: read a PDF/image and produce an IR Invoice + field-level provenance + a " +
        "layout fingerprint, using the workspace OCR template library. For a PDF, a best-effort local " +
        "markitdown digital-text-layer read (if the `markitdown` CLI is installed) is fed in as untrusted " +
        "supplementary context (M1.5) — this NEVER changes extractionMethod, which the extract→book bridge " +
        "always forces to 'ocr'. It runs OUTSIDE the booking sandbox and NEVER books. The file is fed to the " +
        "model as an image/document CONTENT BLOCK (not a Read tool). --dry-run assembles + prints the " +
        "session config only, no creds.",
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
        // [M1.5] Best-effort LOCAL digital-text-layer read (markitdown), PDF only — an image has no text-layer
        // concept. NEVER throws (see ./markitdown-adapter); a missing/failed run degrades to `null`.
        const rawTextLayer =
          document.kind === "document" ? await tryExtractTextLayer(path) : null
        // [M1.5 / #565] The fail-closed GATE, computed ONCE at this single upstream site. The text-layer assist
        // rides into the session ONLY when the read positively classifies as a digital-text-layer. A vision-only
        // classification — including the ambiguous-CZ-amount case, which fails closed like vision — withholds the
        // text ENTIRELY. The SAME gated `textLayer` feeds BOTH the plan assembly (below) and the live session
        // (`sdkExtractSession`), so the `--dry-run` plan and the live run can never diverge: neither embeds the
        // withheld text. (`assembleExtractPlan` re-derives the same gate defensively for any direct caller.)
        const engine = classifyExtractionEngine(rawTextLayer)
        const textLayer = engine === "digital-text-layer" ? rawTextLayer : null
        const plan = assembleExtractPlan(
          document,
          ctx,
          opts.supplier,
          textLayer,
        )

        // Always PRINT the assembled session config first (default-deny tool lists, the content-block fact,
        // the fixed kickoff), so an operator sees exactly what a live run would do before it runs.
        output.write(renderExtractPlan(plan))

        if (!opts.live || opts.dryRun) return

        // Lazy-load the SDK-backed launcher only when actually running live (mirrors `run` / `book`).
        const { sdkExtractSession } = await import("./sdk-launcher")
        // [M0.2a] mcpEndpoint/agentSdkAuth default (resolveBrainEnv); only the API key has no default — it
        // is the one paste a fresh session needs.
        const { mcpEndpoint, apiKey, agentSdkAuth } = resolveBrainEnv(
          process.env,
        )
        if (!apiKey) {
          // Fail-closed: name exactly which cred is unmet, exit non-zero, no stack.
          output.write(
            "brain extract blocked: missing BRAIN_API_KEY. Set it (workspace OCR-template key) to run live.\n",
          )
          process.exit(1)
        }

        const result = await sdkExtractSession({
          session: {
            sections: ctx.sections,
            supplierHint: opts.supplier,
            textLayer,
          },
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

  brain
    .command("onboard")
    .description(
      "Discover whether this organization is bookable (an OPEN accounting period + a DOCUMENT/EVENT " +
        "number series) and, if not, print the exact create_accounting_period/create_number_series calls " +
        "that would fix it. READ-ONLY by default: two GETs, no writes, no agent session — the create " +
        "calls are PROPOSED, never executed. Only with --execute (+ explicit confirmation) are they " +
        "actually POSTed, immediately applied, via the operator's own BRAIN_API_KEY. Needs only BRAIN_API_KEY.",
    )
    .option(
      "--execute",
      "Actually run the proposed create calls (immediately-applied writes) after an explicit confirmation. " +
        "Default is print-only.",
    )
    .action(async (opts: { execute?: boolean }) => {
      const { mcpEndpoint, apiKey } = resolveBrainEnv(process.env)
      if (!apiKey) {
        output.write("brain onboard blocked: missing BRAIN_API_KEY.\n")
        process.exit(1)
      }
      const today = new Date().toISOString().slice(0, 10)
      const { plan, client } = await fetchOnboardingPlan(
        apiKey,
        mcpEndpoint,
        today,
      )
      output.write(renderOnboardingPlan(plan))

      if (!opts.execute) return

      if (plan.proposedCalls.length === 0) {
        output.write("brain onboard: nothing to execute — already bookable.\n")
        return
      }

      const results = await executeOnboardingPlan(
        plan,
        client,
        confirmOnboardingExecute,
      )
      if (results === null) {
        output.write("brain onboard: aborted, nothing executed.\n")
        // Work was pending (proposedCalls > 0, checked above) but nothing was
        // created. A NON-TTY run auto-refused the confirm (fail-closed) — signal
        // non-zero so automation can tell "refused, nothing created" from the
        // exit-0 "already bookable" path above. An INTERACTIVE decline (user
        // typed "n") stays exit 0: the operator deliberately chose not to.
        if (!input.isTTY) process.exitCode = 1
        return
      }

      output.write("\n" + renderOnboardingExecuteResults(results))
      if (results.some((result) => result.status === "failed")) {
        process.exitCode = 1
      }
    })

  brain
    .command("event")
    .description(
      "Propose the accounting EVENT (case) for an extracted invoice, carrying the supplier/customer " +
        "IDENTITY (name/IČO/DIČ) so the derived invoice books against the RIGHT counterparty instead of " +
        "holding on a null one. DETERMINISTIC: a plain operator-key POST /v1/accounting/events (no agent " +
        "session). The write is GATED — HELD for human review at cold start; approve it, then pass the " +
        "applied eventId to `brain book`. Default is print-only; --execute POSTs after confirmation. " +
        "Needs BRAIN_API_KEY.",
    )
    .requiredOption(
      "--extracted <path>",
      "Path to the IR Invoice JSON a `brain extract` run produced.",
    )
    .requiredOption(
      "--context <path>",
      "Path to a JSON file: { periodId, eventSeriesId, confidence, rationale, conversationId?, signals? }. " +
        "eventSeriesId is the EVENT number series (NOT the capture's DOCUMENT series).",
    )
    .option(
      "--execute",
      "POST the create_accounting_event call (gated → HELD for review) after an explicit confirmation. " +
        "Default is print-only.",
    )
    .option(
      "--allow-missing-counterparty",
      "Proceed with --execute even when no counterparty identity was extracted (the derived invoice will " +
        "then HOLD on a null counterparty when booked).",
    )
    .option(
      "--yes",
      "Skip the interactive confirmation prompt on --execute (non-interactive operators).",
    )
    .action(
      async (opts: {
        extracted: string
        context: string
        execute?: boolean
        allowMissingCounterparty?: boolean
        yes?: boolean
      }) => {
        const invoice = readExtractedInvoice(opts.extracted)
        const ctx = readEventContext(opts.context)
        const proposal = buildEventProposal(invoice, ctx)
        output.write(renderEventProposal(proposal))

        if (!opts.execute) return

        // Fail closed on a missing counterparty: emitting a bare event silently would recreate exactly the
        // null-counterparty HOLD this command exists to avoid. Require an explicit override.
        if (!proposal.hasCounterparty && !opts.allowMissingCounterparty) {
          output.write(
            "brain event: refusing --execute — no counterparty identity extracted. Fix the source/IR, or " +
              "pass --allow-missing-counterparty to propose a bare event anyway.\n",
          )
          process.exitCode = 1
          return
        }

        const { mcpEndpoint, apiKey } = resolveBrainEnv(process.env)
        if (!apiKey) {
          output.write("brain event blocked: missing BRAIN_API_KEY.\n")
          process.exit(1)
        }

        const ok = opts.yes || (await confirmEventExecute(proposal.request))
        if (!ok) {
          output.write("brain event: aborted, nothing executed.\n")
          // A non-interactive run with no --yes auto-refused (fail-closed) — signal non-zero so automation
          // can tell "refused" from a print-only exit 0. An interactive decline stays exit 0.
          if (!input.isTTY) process.exitCode = 1
          return
        }

        const client = createAfframeClient({ apiKey, baseUrl: mcpEndpoint })
        const key = eventIdempotencyKey(proposal.request)
        const result = await executeEventCreate(proposal.request, client, key)
        output.write("\n" + renderEventResult(result))
        if (result.status === "failed") process.exitCode = 1
      },
    )
}

/**
 * Read + shallow-validate the `brain event` `--context` file at the system boundary: the EVENT write needs
 * `periodId`, `eventSeriesId` (the EVENT number series — NOT the capture's DOCUMENT series), and the gate
 * envelope (`confidence` / `rationale`, plus optional carry-through `conversationId` / `signals`). Delegates
 * to the shared parametric `readContextFile` (the single reader every operator input uses); its anti-widening
 * pick keeps a stray key out, and the `_minor` reviver is a harmless no-op on a bigint-free event context.
 */
function readEventContext(path: string): IrToEventContext {
  return readContextFile(
    path,
    "--context",
    ["periodId", "eventSeriesId", "confidence", "rationale"],
    ["conversationId", "signals"],
  ) as unknown as IrToEventContext
}

/**
 * The `brain event --execute` confirmation gate — mirrors `confirmOnboardingExecute` (same TTY check, same
 * fail-closed non-interactive default), but names what this is: a GATED write that HOLDS for human review
 * at cold start (not an immediately-applied create). Spells out the case description + the counterparty the
 * server will find-or-create, so the operator confirms the partner before the write is queued.
 */
function confirmEventExecute(
  request: CreateAccountingEventRequest,
): Promise<boolean> {
  return confirmYesNo(
    `This will POST create_accounting_event (a GATED write — HELD for human review at cold start):\n` +
      `  ${request.description}\n` +
      `  counterparty: ${
        request.counterparty ? JSON.stringify(request.counterparty) : "(none)"
      }\n` +
      `Proceed? [y/N]: `,
    "brain event: non-interactive and no --yes — refusing to POST without confirmation.\n",
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
  optionalKeys: readonly K[] = [],
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
  // Carry-through optionals: picked ONLY when present, so a widening key is still DROPPED (the
  // anti-widening guarantee holds) while a genuine optional (conversationId / signals) survives.
  for (const key of optionalKeys) if (key in obj) picked[key] = obj[key]
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

/**
 * The bulk `book-batch` flow: assemble the folder's capture plan, then run every bookable document through the
 * single-document live path with bounded concurrency, 429 retry/backoff, and crash-safe resume (the M0.6
 * orchestrator). Each document's DETERMINISTIC idempotency key is derived + printed up front, so the operator
 * can see the exact key that makes a resumed re-book a server-side replay rather than a double-book. `--dry-run`
 * assembles + prints (plan + keys + checkpoint path) with no creds; a live run confirms, then reports the
 * per-document summary.
 */
async function runBookBatch(
  folder: string,
  opts: {
    context: string
    concurrency?: string
    maxAttempts?: string
    checkpoint?: string
    dryRun?: boolean
    yes?: boolean
  },
): Promise<void> {
  const ctx = readBookContext(opts.context)
  const book = assembleBookPlan(folder, ctx, new Date().toISOString())
  const jobs: BatchJob[] = book.entries.map((entry) => ({
    sourceLocator: entry.sourceLocator,
    recordType: entry.recordType,
    plan: entry.plan,
  }))

  // Print the assembled plan (verbatim capture bodies + skips + warnings), then the per-document deterministic
  // idempotency keys — the content-addressed, clock-free keys that make resume safe.
  output.write(renderBookPlan(book, ctx))
  output.write(
    "\nDeterministic idempotency keys (content-addressed; stable across retries + resume):\n",
  )
  jobs.forEach((job, index) => {
    output.write(
      `  [${index + 1}] ${job.recordType} ${job.sourceLocator}\n      ${deriveIdempotencyKey(job)}\n`,
    )
  })

  const checkpointPath =
    opts.checkpoint ?? join(folder, ".afframe-book-checkpoint.json")
  output.write(`\nCheckpoint (crash-safe resume): ${checkpointPath}\n`)

  if (opts.dryRun) return
  if (jobs.length === 0) {
    output.write("brain book-batch: no bookable documents to run.\n")
    return
  }

  const concurrency = parsePositiveInt(
    opts.concurrency ?? process.env.BRAIN_BOOK_CONCURRENCY,
    8,
    "--concurrency",
  )
  const maxAttempts = parsePositiveInt(opts.maxAttempts, 5, "--max-attempts")

  const confirmed = opts.yes || (await confirmLiveRun(jobs.length))
  if (!confirmed) {
    output.write("brain book-batch: aborted, no live run.\n")
    return
  }

  const summary = await runBatch({
    folderId: folder,
    jobs,
    runOne: liveBookOne,
    store: new FileCheckpointStore(checkpointPath),
    concurrency,
    maxAttempts,
    onProgress: (record) =>
      output.write(
        `  [${record.status}] ${record.recordType} ${record.sourceLocator}` +
          (record.reviewId ? ` (review ${record.reviewId})` : "") +
          (record.error ? `: ${record.error}` : "") +
          "\n",
      ),
  })
  output.write("\n" + renderBatchSummary(summary))
  // Non-zero exit iff any document failed, so an operator's script can detect an incomplete batch (rerun the
  // exact command to resume — completed documents are skipped, so nothing double-books).
  if (summary.failed > 0) process.exitCode = 1
}

/** Parse a positive-integer CLI option, failing LOUD on a non-integer / non-positive value. */
function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  label: string,
): number {
  if (raw == null || raw === "") return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `brain book-batch: ${label} must be a positive integer, got ${JSON.stringify(raw)}`,
    )
  }
  return n
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
 * [M0.2a] Resolve `runLiveBrainSession`'s `readEnv` name → value for the THREE creds it still requires
 * (`BRAIN_HARNESS_REQUIRED_ENV`), from the already-defaulted `BrainEnv` — so the harness gate sees the
 * RESOLVED value (e.g. the prod default), not the possibly-unset raw process env. Any other name (there are
 * none left today; kept generic for forward-compat) falls back to the raw process env.
 */
function readHarnessEnv(name: string, resolved: BrainEnv): string | undefined {
  switch (name) {
    case BRAIN_HARNESS_REQUIRED_ENV.mcpEndpoint:
      return resolved.mcpEndpoint
    case BRAIN_HARNESS_REQUIRED_ENV.apiKey:
      return resolved.apiKey
    case BRAIN_HARNESS_REQUIRED_ENV.agentSdkAuth:
      return resolved.agentSdkAuth
    default:
      return process.env[name]
  }
}

/**
 * Drive ONE inspected plan through the live loop (shared by `brain run`, the structured folder path, and the
 * OCR bridge). It fails CLOSED on the `BrainHarnessNotWiredError` — writing `${command} blocked: <message>`,
 * exiting non-zero, no stack — so a run can never proceed without real creds. The SDK-backed launcher is
 * lazy-loaded so non-live paths never pull in the SDK. [M0.2a] The write lane itself is no longer client-
 * gated: `renderLiveResult` prints a clean human sentence for an admission-refused / lane-off server
 * response, instead of the raw 429 tool-result text.
 */
async function runPlanLive(
  plan: BrainSessionPlan,
  command: string,
): Promise<void> {
  const { sdkAgentSessionLauncher } = await import("./sdk-launcher")
  const brainEnv = resolveBrainEnv(process.env)
  try {
    const result = await runLiveBrainSession({
      plan,
      mcpEndpoint: brainEnv.mcpEndpoint,
      readEnv: (name) => readHarnessEnv(name, brainEnv),
      launcher: sdkAgentSessionLauncher,
    })
    output.write(renderLiveResult(result))
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
 * TTY-guarded yes/no confirmation gate — the single interactive-confirm helper every write command shares
 * (book / onboard / event). Prompts on a TTY; a non-interactive invocation (no `--yes`) is a DECLINE
 * (fail-safe — never auto-run a write without an explicit operator OK), printing `refusalMessage`. Returns
 * true only on an explicit `y` / `yes`.
 */
async function confirmYesNo(
  prompt: string,
  refusalMessage: string,
): Promise<boolean> {
  if (!input.isTTY) {
    output.write(refusalMessage)
    return false
  }
  const rl = createInterface({ input, output })
  const answer = (await rl.question(prompt)).trim().toLowerCase()
  rl.close()
  return answer === "y" || answer === "yes"
}

/** The live-run confirmation gate (after the plan is printed). */
function confirmLiveRun(count: number): Promise<boolean> {
  return confirmYesNo(
    `Run ${count} live booking session(s) with the plan above? [y/N]: `,
    "brain book: non-interactive and no --yes — refusing to run live without confirmation.\n",
  )
}

/**
 * The `brain onboard --execute` gate — spells out each proposed call (these are immediately-applied writes,
 * a 201 on success, NOT a review-queue HELD) before asking.
 */
export function confirmOnboardingExecute(
  plan: OnboardingPlan,
): Promise<boolean> {
  const summary = plan.proposedCalls
    .map((call, index) => `  [${index + 1}] ${call.tool} — ${call.purpose}`)
    .join("\n")
  return confirmYesNo(
    `This will CREATE the following (immediately applied, not a dry run):\n${summary}\n` +
      `Proceed? [y/N]: `,
    "brain onboard: non-interactive and no confirmation possible — refusing to execute without one.\n",
  )
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

/**
 * Read + shallow-validate the operator-supplied POSTING (double-entry) plan inputs: `invoice` / `sections` /
 * `posting`. The shared `readContextFile` picks EXACTLY those keys (any `policy` or other widening key is
 * DROPPED, same as `readInputs`), and `withAssembledSections` stamps the LOCKED constitution + safety spine on.
 * `posting` carries only the id + gate-correlation envelope (periodId / summaryRecordId / accountingEventId /
 * postingDate / conversationId) the model stamps onto the write — never an account choice (the model reasons
 * those). The money fields inside `invoice` survive as `bigint` via the shared `_minor` reviver.
 */
function readPostingInputs(path: string): {
  invoice: Invoice
  sections: LoginContextSections
  posting: PostingSessionContext
} {
  return withAssembledSections(
    readContextFile(path, "--inputs", ["invoice", "sections", "posting"]),
  ) as {
    invoice: Invoice
    sections: LoginContextSections
    posting: PostingSessionContext
  }
}
