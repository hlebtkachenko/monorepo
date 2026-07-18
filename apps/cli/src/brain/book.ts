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
  invoiceToCapture,
  parseCsv,
  parseIsdoc,
  parsePohodaDataPack,
  parseXlsx,
  planBrainDryRun,
  planForCapture,
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
  type Invoice,
  type IrRecord,
  type LoginContextSections,
} from "@workspace/brain"
import { indent } from "./render"

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
  /**
   * The SUBJECT org's public register identity (IČO / DIČ) — the org whose books this folder is. It orients a
   * reader-relative document direction (issued vs received) for formats that do not encode it (ISDOC: an
   * e-invoice is identical on both sides). NOT a tenancy key: the real tenant is server-resolved from the
   * API-key principal; this only tells the parser which party is "us". Absent ⇒ ISDOC files fail closed.
   */
  subject?: { ico?: string; dic?: string }
}

/** One bookable record, mapped to its capture request + the assembled plan the live run would execute. */
interface BookPlanEntry {
  /** The provenance locator of the IR record this plan books (so the operator can trace it to a source). */
  sourceLocator: string
  /** The IR record kind (`invoice` / `bank_transaction` / `cash_document`). */
  recordType: IrRecord["record_type"]
  /** The assembled dry-run plan — the same shape a live run drives, one per bookable record. */
  plan: BrainDryRunPlan
}

/** A record the parsers surfaced that `book` deliberately does NOT book, with the reason. */
interface BookSkip {
  sourceLocator: string
  recordType: IrRecord["record_type"]
  /** Why it was skipped (a GLEntry / Attachment is never a booking source — control 2). */
  reason: string
}

/** A file in the folder `book` could not turn into a bookable plan (unknown / unsupported format). */
interface BookFileNote {
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
  isdoc: parseIsdoc,
}

/** A human-readable reason for a format we detect but have no parser for yet (so it is reported, not silent). */
const UNWIRED_FORMAT_REASON: Record<string, string> = {
  pdf: "pdf has no structured parser (needs OCR intake) — no capture plan produced",
  pohoda_db: "native Pohoda backup — re-export as dataPack XML before booking",
  zip: "nested zip — unpack it and re-run book on the extracted files",
  unknown: "unrecognized format — not a structured accounting export",
}

/**
 * The `ParseContext.orgRef` value stamped onto every record `book` produces. `book` has NO org ref to give:
 * the org is resolved SERVER-side from the API-key principal at write time (never a client input), and the
 * operator `--context` carries only period/series/event uuids — none of them an org. `orgRef` lands verbatim
 * in each IR record's provenance (`org_ref`) and feeds the content-addressed `ir_id` hash, so it must be an
 * HONEST, non-tenant sentinel — NOT an accounting-period uuid masquerading as an org ref. This clearly-labeled
 * placeholder says exactly that: these records were assembled client-side by `book`, org unresolved.
 */
const BOOK_ORG_REF = "book:org-unresolved"

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
 * Assemble the `BrainDryRunPlan` a live run drives for one BOOKABLE record. Every record kind maps to its
 * capture request through the record-type-matched WP-A adapter (`invoiceToCapture` / `bankToCapture` /
 * `cashDocumentToCapture`), then `planForCapture` assembles the login pack + fixed read→classify→propose
 * toolPlan around that request — one source of truth for the sandbox + tool sequence across all three record
 * kinds, only the write body differs.
 */
function planForRecord(
  record: BookableRecord,
  ctx: BookContext,
): BrainDryRunPlan {
  // A folder of structured exports is, by definition, a STRUCTURED source. Stamp `extractionMethod:
  // "structured"` HONESTLY (unless the operator context already declared it), so these captures are not
  // mislabeled as OCR by omission — the OCR fail-closed leg (#554) then screens only the genuine `book <pdf>`
  // OCR path below, never a Pohoda/xlsx/csv export.
  const captureContext: IrToCaptureContext = {
    extractionMethod: "structured",
    ...ctx.captureContext,
  }
  const captureRequest = isInvoice(record)
    ? invoiceToCapture(record, captureContext)
    : isBankTransaction(record)
      ? bankToCapture(record, captureContext)
      : cashDocumentToCapture(record, captureContext)

  return planForCapture(captureRequest, ctx.sections)
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
      orgRef: BOOK_ORG_REF,
      sourcePath: rel,
      ingestedAt,
      // The subject org's IČO/DIČ orients ISDOC direction (issued vs received). Absent ⇒ the ISDOC parser
      // fails closed with a warning; other parsers ignore it. NOT a tenancy key (see BookContext.subject).
      ...(ctx.subject?.ico ? { subjectIco: ctx.subject.ico } : {}),
      ...(ctx.subject?.dic ? { subjectDic: ctx.subject.dic } : {}),
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

/**
 * [W1.4] The OCR extract→book bridge — the smallest seam that lets a REAL PDF invoice flow into the HELD
 * write loop. A `brain extract` vision-OCR pre-pass produces the IR Invoice (+ field-level provenance + the
 * matched OCR template, if any); this hands that IR to the SAME `planBrainDryRun` (single-invoice) path the
 * `brain run` command uses, but with the gate envelope stamped for the OCR path:
 *
 *   - `extractionMethod` is FORCED to `"ocr"` (spread AFTER the operator context, so it can never be softened
 *     back to `"structured"`) — the source-honesty marker for a vision-OCR read.
 *   - `templateId` is carried through from the operator context: present ONLY when extraction matched a
 *     workspace OCR template. When it is absent (or resolves to no CONFIRMED row server-side), the server
 *     fail-closes the `"ocr"` capture to HELD via the `unverified_template` leg (#554) — the write is held for
 *     human review, never auto-applied.
 *   - `signals` / `confidence` are carried verbatim from the extraction (never forged; degraded server-side).
 *
 * PURE of network + creds: `planBrainDryRun` maps the IR through the WP-A adapter and assembles the login
 * pack + fixed read→classify→propose tool plan under the pinned `BRAIN_ACCOUNTING_POLICY` — the SAME
 * `BrainDryRunPlan` a live run drives. No booking here — the live capture (and the server gate) still hold
 * every write.
 */
export function assembleOcrCapturePlan(
  invoice: Invoice,
  ctx: BookContext,
): BrainDryRunPlan {
  return planBrainDryRun({
    invoice,
    sections: ctx.sections,
    // Force the OCR discriminator on this path — the file was read by vision-OCR, so `"ocr"` is the honest
    // marker regardless of what the operator context declared. templateId / signals / the uuids ride through.
    captureContext: { ...ctx.captureContext, extractionMethod: "ocr" },
  })
}

/**
 * Render the assembled OCR capture plan for operator inspection — the verbatim `captureRequest` body a live
 * `--live` run would embed, with the OCR-basis facts (extractionMethod + whether a template was matched)
 * stated plainly so nothing about the fail-closed decision is silent. This is the text `book <pdf> --dry-run`
 * prints and `--live` prints BEFORE the confirmation gate.
 */
export function renderOcrCapturePlan(
  plan: BrainDryRunPlan,
  invoice: Invoice,
): string {
  const templateId = plan.captureRequest.templateId
  const lines: string[] = []
  lines.push(
    "Afframe brain book <pdf> — OCR extract→book capture plan (inspect before running live).",
  )
  lines.push("")
  lines.push("Extracted from a vision-OCR pre-pass (extractionMethod = ocr):")
  lines.push(`  source   = ${invoice.source_locator}`)
  lines.push(`  document = ${invoice.number} (${invoice.direction})`)
  lines.push(
    `  template = ${
      templateId != null
        ? `${templateId} (matched — server checks it is CONFIRMED)`
        : "(none matched — server fail-closes this OCR capture to HELD)"
    }`,
  )
  lines.push("")
  lines.push("Capture request the live session would embed:")
  lines.push(indent(JSON.stringify(plan.captureRequest, bigintReplacer, 2), 2))
  return lines.join("\n") + "\n"
}

/** JSON.stringify replacer that renders bigint minor-unit fields as strings (a capture request carries none, defensive). */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value
}
