// #469 (WS-3) — the creds-free "folder → capture plan" assembly for `afframe brain book <folder>`.
//
// This is the SDK-FREE, unit-tested half of the `book` command: it walks a folder of structured accounting
// exports, detects + parses each leaf into Brain IR (via @workspace/intake parsers), maps every BOOKABLE IR
// record through the right IR→capture adapter, and assembles the SAME `BrainDryRunPlan` a live run executes —
// one per bookable record. It contacts NOTHING (no creds, no network): `book --dry-run` stops after printing
// what this produces, and the `--live` path in `command.ts` embeds each assembled `captureRequest` VERBATIM
// (the operator-inspects-then-verbatim-embed property) before driving it through `runLiveBrainSession`.
//
// periodId / seriesId / eventId are NOT MCP-resolved here: they name tenant-side rows the Brain would
// normally discover via a live `get_structure` read, which is non-trivial and creds-bound. They are taken
// OPERATOR-SUPPLIED from the `--context` file (the exact `IrToCaptureContext` shape `brain run` uses) and are
// printed back as such, so nothing auto-resolved is ever silent — see `command.ts` help + `BOOK-*` comments.

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import {
  bankToCapture,
  cashDocumentToCapture,
  detectFormat,
  parseCsv,
  parsePohodaDataPack,
  parseXlsx,
  planBrainDryRun,
  type BrainDryRunPlan,
  type IrToCaptureContext,
  type ParseContext,
  type ParseResult,
  type ParseWarning,
} from "@workspace/intake"
import {
  isBankTransaction,
  isBookableSource,
  isInvoice,
  type BookableRecord,
  type IrRecord,
  type LoginContextSections,
} from "@workspace/brain"

/**
 * The operator-supplied context a `book` run needs, mirroring the `--inputs` shape `brain run` consumes:
 * the login-pack `sections` (the provenance-checked safety texts the plan boots with) + the `captureContext`
 * (the operator-supplied uuids + gate envelope). NEITHER is derivable from the folder — `sections` are the
 * safety spine, and the uuids name tenant-side rows resolved out-of-band. NO tenancy keys.
 */
export interface BookContext {
  /** The login-pack section texts (constitution / KB pointer / law / confidence / escalation). */
  sections: LoginContextSections
  /** The operator-supplied capture context (periodId / seriesId / eventId + confidence + rationale). */
  captureContext: IrToCaptureContext
}

/** One bookable record, mapped to its capture request + the assembled plan the live run would execute. */
export interface BookPlanEntry {
  /** The provenance locator of the IR record this plan books (so the operator can trace it to a source). */
  sourceLocator: string
  /** The IR record kind (`invoice` / `bank_transaction` / `cash_document`). */
  recordType: IrRecord["record_type"]
  /** The assembled dry-run plan — the same shape a live run drives, one per bookable record. */
  plan: BrainDryRunPlan
}

/** A record the parsers surfaced that `book` deliberately does NOT book, with the reason. */
export interface BookSkip {
  sourceLocator: string
  recordType: IrRecord["record_type"]
  /** Why it was skipped (a GLEntry / Attachment is never a booking source — control 2). */
  reason: string
}

/** A file in the folder `book` could not turn into a bookable plan (unknown / unsupported format). */
export interface BookFileNote {
  path: string
  message: string
}

/** The full inspectable result of a `book` assembly — plans to run + everything deliberately not run. */
export interface BookPlan {
  /** The ordered bookable-record plans (one live run each). */
  entries: BookPlanEntry[]
  /** Records the parsers produced but that are not booking sources (GLEntry / Attachment). */
  skips: BookSkip[]
  /** Files whose format has no wired parser (isdoc / pdf / pohoda_db / unknown), or which failed to parse. */
  files: BookFileNote[]
  /** Parser warnings, surfaced verbatim for the human-review pile. */
  warnings: ParseWarning[]
}

/** The parsers wired in @workspace/intake today, keyed by the `DetectedFormat` `detectFormat` resolves to. */
const PARSERS: Partial<
  Record<string, (bytes: Uint8Array, ctx: ParseContext) => ParseResult>
> = {
  csv: parseCsv,
  xlsx: parseXlsx,
  pohoda_xml: parsePohodaDataPack,
}

/** A human-readable reason for a format we detect but have no parser for yet (so it is reported, not silent). */
const UNWIRED_FORMAT_REASON: Record<string, string> = {
  isdoc:
    "isdoc parsing is not wired in this package yet — no capture plan produced",
  pdf: "pdf has no structured parser (needs OCR intake) — no capture plan produced",
  pohoda_db: "native Pohoda backup — re-export as dataPack XML before booking",
  zip: "nested zip — unpack it and re-run book on the extracted files",
  unknown: "unrecognized format — not a structured accounting export",
}

/** List every file under `folder` recursively, returning absolute paths. Directories are descended, not booked. */
function walkFiles(folder: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(folder)) {
    const full = join(folder, name)
    if (statSync(full).isDirectory()) out.push(...walkFiles(full))
    else out.push(full)
  }
  return out.sort()
}

/**
 * Assemble the `BrainDryRunPlan` a live run drives for one BOOKABLE record. An invoice goes straight through
 * `planBrainDryRun` (which wires `invoiceToCapture`). A bank/cash record maps via its own adapter, then
 * borrows an invoice plan's login pack + policy + fixed read→propose toolPlan and re-points the write call to
 * the record-type-matched capture request — one source of truth for the sandbox + tool sequence across all
 * three record kinds, only the write body differs.
 */
function planForRecord(
  record: BookableRecord,
  ctx: BookContext,
): BrainDryRunPlan {
  if (isInvoice(record)) {
    return planBrainDryRun({
      invoice: record,
      sections: ctx.sections,
      captureContext: ctx.captureContext,
    })
  }

  const captureRequest = isBankTransaction(record)
    ? bankToCapture(record, ctx.captureContext)
    : cashDocumentToCapture(record, ctx.captureContext)

  // Borrow an invoice plan's skeleton (login pack + policy + toolPlan) via the placeholder, then swap in this
  // record's captureRequest so the plan an operator inspects carries the bank/cash write body, never an
  // invoice's. The placeholder-derived captureRequest is discarded — it never reaches the returned plan.
  const skeleton = planBrainDryRun({
    invoice: PLACEHOLDER_INVOICE,
    sections: ctx.sections,
    captureContext: ctx.captureContext,
  })
  return {
    ...skeleton,
    captureRequest,
    toolPlan: skeleton.toolPlan.map((call) =>
      call.toolName === "mcp__afframe__capture_accounting_document"
        ? { ...call, input: captureRequest }
        : call,
    ),
  }
}

/**
 * A minimal placeholder invoice used ONLY to borrow `planBrainDryRun`'s login pack + toolPlan skeleton for a
 * non-invoice record — its produced captureRequest is DISCARDED and replaced by the record-type-matched
 * adapter's output in `planForRecord`. It never reaches a plan the operator inspects.
 */
const PLACEHOLDER_INVOICE = {
  ir_id: "book-skeleton",
  org_ref: "book",
  source: "csv" as const,
  source_locator: "book/skeleton",
  source_hash: "book",
  ingested_at: "1970-01-01T00:00:00.000Z",
  confidence: 1,
  needs_review: false,
  raw: {},
  record_type: "invoice" as const,
  direction: "received" as const,
  doc_type: "invoice" as const,
  number: "SKELETON",
  issue_date: "1970-01-01",
  currency: "CZK",
  lines: [],
  vat_summary: [],
  total_minor: 0n,
}

/**
 * Walk `folder`, parse every structured export into IR, and assemble the capture plan a live run would drive.
 * PURE of network + creds: reads the folder from disk, runs the intake parsers, and maps bookable records via
 * the adapters. GLEntry / Attachment are skipped (never booking sources — control 2). Unwired formats + parse
 * failures are reported as file notes; parser warnings are surfaced verbatim. `ingestedAt` is injected so the
 * assembly is deterministic given the same folder + clock stamp.
 */
export function assembleBookPlan(
  folder: string,
  ctx: BookContext,
  ingestedAt: string,
): BookPlan {
  const entries: BookPlanEntry[] = []
  const skips: BookSkip[] = []
  const files: BookFileNote[] = []
  const warnings: ParseWarning[] = []

  for (const absPath of walkFiles(folder)) {
    const rel = relative(folder, absPath)
    const bytes = new Uint8Array(readFileSync(absPath))
    const format = detectFormat(bytes, absPath)

    const parser = PARSERS[format]
    if (!parser) {
      files.push({
        path: rel,
        message:
          UNWIRED_FORMAT_REASON[format] ??
          `format ${format} has no wired parser`,
      })
      continue
    }

    const parseContext: ParseContext = {
      orgRef: ctx.captureContext.periodId,
      sourcePath: rel,
      ingestedAt,
    }
    const result = parser(bytes, parseContext)
    warnings.push(...result.warnings)

    for (const record of result.records) {
      if (!isBookableSource(record)) {
        skips.push({
          sourceLocator: record.source_locator,
          recordType: record.record_type,
          reason: `${record.record_type} is import/reconcile-only, never a booking source (control 2)`,
        })
        continue
      }

      entries.push({
        sourceLocator: record.source_locator,
        recordType: record.record_type,
        plan: planForRecord(record, ctx),
      })
    }
  }

  return { entries, skips, files, warnings }
}

/**
 * Render the assembled plan for operator inspection. It prints the operator-SUPPLIED ids up front (so nothing
 * auto-resolved is silent), then every ordered capture request, the skipped records, the unwired files, and
 * the parser warnings. This is the exact text a `--dry-run` prints and a `--live` run prints BEFORE the
 * confirmation gate — the operator sees the verbatim `captureRequest` bodies the live session would embed.
 */
export function renderBookPlan(book: BookPlan, ctx: BookContext): string {
  const lines: string[] = []
  lines.push(
    "Afframe brain book — assembled capture plan (inspect before running live).",
  )
  lines.push("")
  lines.push(
    "Operator-supplied context (NOT MCP-resolved — taken verbatim from --context):",
  )
  lines.push(`  periodId = ${ctx.captureContext.periodId}`)
  lines.push(`  seriesId = ${ctx.captureContext.seriesId}`)
  lines.push(`  eventId  = ${ctx.captureContext.eventId}`)
  lines.push("")
  lines.push(`Bookable capture requests (${book.entries.length}):`)
  book.entries.forEach((entry, index) => {
    lines.push("")
    lines.push(`  [${index + 1}] ${entry.recordType} — ${entry.sourceLocator}`)
    lines.push(
      indent(JSON.stringify(entry.plan.captureRequest, bigintReplacer, 2), 6),
    )
  })

  if (book.skips.length > 0) {
    lines.push("")
    lines.push(`Skipped (not booking sources) (${book.skips.length}):`)
    for (const skip of book.skips) {
      lines.push(`  - ${skip.recordType} ${skip.sourceLocator}: ${skip.reason}`)
    }
  }

  if (book.files.length > 0) {
    lines.push("")
    lines.push(`Unbooked files (${book.files.length}):`)
    for (const file of book.files) {
      lines.push(`  - ${file.path}: ${file.message}`)
    }
  }

  if (book.warnings.length > 0) {
    lines.push("")
    lines.push(`Parser warnings (${book.warnings.length}):`)
    for (const warning of book.warnings) {
      lines.push(`  - ${warning.path}: ${warning.message}`)
    }
  }

  return lines.join("\n") + "\n"
}

/** JSON.stringify replacer that renders bigint minor-unit fields as strings (a capture request carries none, defensive). */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces)
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n")
}
