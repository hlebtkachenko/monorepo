"use server"

import { createHash } from "node:crypto"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import type { BetaImportDataset } from "@/db/schema"
import {
  createDraftBatch,
  deleteDraftBatch,
  publishBatch,
  rollbackDataset,
} from "@/lib/data/imports"
import { ensureReportingPeriod } from "@/lib/data/reporting-periods"
import { requireOwner, requireScope, type OwnerScope } from "@/lib/data/scope"
import { isCheckViolation } from "@/lib/pg-error"
import {
  isCsvDataset,
  readDatasetCsv,
  type CsvDatasetResult,
} from "@/lib/import/datasets"

import { formInteger, formPeriodKind, formString, formUuid } from "./input"
import {
  CSV_ISSUE_LIMIT,
  CSV_ISSUE_MESSAGE_KEY,
  CSV_STRUCTURAL_MESSAGE_KEY,
  type UzaverkaActionState,
} from "./uzaverka-state"

/**
 * Měsíční uzávěrka's writes (spec §3.2) — publish, rollback, discard, and the
 * manual CSV fallback.
 *
 * NONE OF THEM ADDS A PUBLISH SEMANTIC. `publishBatch` and `rollbackDataset`
 * already own the supersession chain, the period lock and the one-published
 * invariant; these actions read a `FormData`, prove an `OwnerScope`, call one
 * of those functions, and translate its typed refusal into a Czech message key.
 * If a rule about publishing is ever wanted, it belongs in
 * `lib/data/imports.ts` where the lock is, not here where the form is.
 *
 * EVERY ONE OPENS WITH `requireOwner(await requireScope(orgSlug))`, for the
 * reason `zadavani.ts` states at length: a Server Action is a public POST with
 * a generated name, reachable without ever rendering `pro-ucetni/layout.tsx`'s
 * gate. `orgSlug` travels as a hidden field.
 *
 * THE CSV PATH PARSES ON THE SERVER, and that is a security choice rather than
 * a convenience one. Parsing in the browser would mean the action accepts
 * already-parsed ROWS — at which point the file format stops being the contract
 * and a hand-made POST decides what a "published rozvaha" contains. Here the
 * only thing crossing the boundary is bytes, and `lib/import/` is the one place
 * that decides what they mean. It also keeps the parser a pure function with no
 * DOM, testable without a browser.
 */

/** The upload ceiling, ahead of `file.arrayBuffer()` rather than after it. */
const CSV_MAX_BYTES = 2 * 1024 * 1024

async function ownerFor(
  formData: FormData,
): Promise<{ orgSlug: string; owner: OwnerScope }> {
  const orgSlug = formString(formData, "orgSlug")
  return { orgSlug, owner: requireOwner(await requireScope(orgSlug)) }
}

/**
 * Everything a publish or a rollback can change: the review surface itself and
 * all three client statements (the batch that just went live IS what they
 * render).
 */
function revalidateUzaverka(orgSlug: string): void {
  revalidatePath(`/${orgSlug}/pro-ucetni/uzaverka`)
  revalidatePath(`/${orgSlug}/vykazy`)
  revalidatePath(`/${orgSlug}/vykazy/vzz`)
  revalidatePath(`/${orgSlug}/vykazy/predvaha`)
}

const INVALID: UzaverkaActionState = {
  status: "error",
  error: "uzaverka.errorInvalidInput",
}

/**
 * Run a write, turning a database CHECK refusal into an ordinary error state —
 * the same floor `zadavani.ts` puts under its own writes, and for the same
 * reason: a rule enforced only in SQL must surface as a refusal, not as a 500
 * carrying a constraint name.
 */
async function guarded(
  write: () => Promise<UzaverkaActionState>,
): Promise<UzaverkaActionState> {
  try {
    return await write()
  } catch (error) {
    if (isCheckViolation(error)) {
      return { status: "error", error: "uzaverka.errorRejected" }
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Publish / rollback / discard
// ---------------------------------------------------------------------------

/**
 * Publish a draft over whatever the key currently holds.
 *
 * `publishBatch`'s three refusals are reported apart, because they mean
 * different things to the office: an unknown batch is a stale page, a
 * superseded one is "you are looking at history and the button you want is
 * Vrátit", and a conflict is a race that the office should simply retry.
 * `alreadyPublished` is a SUCCESS — re-publishing is idempotent by design, and
 * telling the office it failed would invite a second, real publish.
 */
export async function publishBatchAction(
  _previous: UzaverkaActionState,
  formData: FormData,
): Promise<UzaverkaActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const batchId = formUuid(formData, "batchId")
  if (batchId === null) return INVALID

  return guarded(async () => {
    const outcome = await publishBatch(owner, batchId)
    if (!outcome.ok) {
      return {
        status: "error",
        error:
          outcome.reason === "unknown_batch"
            ? "uzaverka.errorUnknownBatch"
            : outcome.reason === "already_superseded"
              ? "uzaverka.errorAlreadySuperseded"
              : "uzaverka.errorConflict",
      }
    }

    revalidateUzaverka(orgSlug)
    return {
      status: "ok",
      message: outcome.alreadyPublished
        ? "uzaverka.okAlreadyPublished"
        : outcome.supersededBatchId === null
          ? "uzaverka.okPublished"
          : "uzaverka.okPublishedOver",
    }
  })
}

/**
 * "Vrátit poslední import" (spec §3.2).
 *
 * The two success shapes are reported apart because the CLIENT-VISIBLE outcome
 * differs: with a predecessor the statement goes back to the previous month's
 * import, without one the dataset has NO published batch and the client's page
 * goes back to "zatím nebylo nahráno". An office that rolled back expecting the
 * first and got the second needs to know immediately.
 */
export async function rollbackDatasetAction(
  _previous: UzaverkaActionState,
  formData: FormData,
): Promise<UzaverkaActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const periodId = formUuid(formData, "periodId")
  const dataset = formDataset(formData)
  if (periodId === null || dataset === null) return INVALID

  return guarded(async () => {
    const outcome = await rollbackDataset(owner, { periodId, dataset })
    if (!outcome.ok) {
      return { status: "error", error: "uzaverka.errorNothingPublished" }
    }

    revalidateUzaverka(orgSlug)
    return {
      status: "ok",
      message:
        outcome.restoredBatchId === null
          ? "uzaverka.okRolledBackToEmpty"
          : "uzaverka.okRolledBack",
    }
  })
}

/** Discard a draft the office is not going to publish. Drafts only. */
export async function discardDraftAction(
  _previous: UzaverkaActionState,
  formData: FormData,
): Promise<UzaverkaActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const batchId = formUuid(formData, "batchId")
  if (batchId === null) return INVALID

  return guarded(async () => {
    const deleted = await deleteDraftBatch(owner, batchId)
    if (!deleted) {
      return { status: "error", error: "uzaverka.errorUnknownBatch" }
    }

    revalidateUzaverka(orgSlug)
    return { status: "ok", message: "uzaverka.okDiscarded" }
  })
}

// ---------------------------------------------------------------------------
// The manual CSV fallback
// ---------------------------------------------------------------------------

/**
 * Read a CSV file into a DRAFT batch, and send the office to its preview.
 *
 * IT NEVER PUBLISHES. The file becomes a draft — invisible to every client
 * (`publishedBatchFor` filters on status in SQL) — and going live is a separate,
 * deliberate click on a page that shows the parsed rows. That is what makes the
 * fallback safe to use at month end: a mis-picked file costs a discard, not a
 * wrong rozvaha on the client's screen.
 *
 * THE REDIRECT IS THE PREVIEW. Returning "ok" and leaving the office to find
 * the new draft in the history list would be one more place to click and one
 * more chance to publish the wrong batch; landing on the batch itself makes the
 * next action unambiguous.
 */
export async function uploadCsvBatchAction(
  _previous: UzaverkaActionState,
  formData: FormData,
): Promise<UzaverkaActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const dataset = formString(formData, "dataset")
  if (!isCsvDataset(dataset)) return INVALID

  const period = readPeriodFields(formData)
  if (period === null) {
    return { status: "error", error: "uzaverka.errorPeriodInvalid" }
  }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", error: "uzaverka.errorNoFile" }
  }
  // Checked BEFORE the bytes are pulled into memory, so an accidental 200 MB
  // pick is refused rather than buffered.
  if (file.size > CSV_MAX_BYTES) {
    return { status: "error", error: "uzaverka.errorFileTooLarge" }
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  let text: string
  try {
    // `fatal` on purpose: a Windows-1250 export decoded leniently would come
    // through with replacement characters in every Czech name and parse
    // "successfully" into a batch full of mojibake. Better to say what is
    // wrong while the office still has the export dialog open.
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return { status: "error", error: "uzaverka.errorNotUtf8" }
  }

  const parsed = readDatasetCsv(dataset, text)
  if (!parsed.ok) return csvRefusal(parsed)

  let draftId: string
  try {
    const reportingPeriod = await ensureReportingPeriod(owner, period)
    const draft = await writeDraft(owner, parsed, {
      periodId: reportingPeriod.id,
      filename: file.name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })
    draftId = draft.id
  } catch (error) {
    if (isCheckViolation(error)) {
      return { status: "error", error: "uzaverka.errorRejected" }
    }
    throw error
  }

  revalidateUzaverka(orgSlug)
  // OUTSIDE the try, deliberately: `redirect` works by throwing, and catching
  // it alongside the database refusals would turn a successful import into an
  // error message about a constraint that was never violated.
  redirect(`/${orgSlug}/pro-ucetni/uzaverka/${draftId}`)
}

/**
 * Write the parsed payload as a draft.
 *
 * A `switch` over the payload's own discriminator rather than one spread call:
 * `ImportBatchInput` deliberately makes a mismatched (dataset, rows) pair
 * unrepresentable, and spreading a union into it would launder exactly the
 * guarantee that type exists to give.
 */
async function writeDraft(
  owner: OwnerScope,
  parsed: Extract<CsvDatasetResult, { ok: true }>,
  batch: { periodId: string; filename: string; sha256: string },
): Promise<{ id: string }> {
  const common = {
    periodId: batch.periodId,
    source: "manual" as const,
    filename: batch.filename,
    sha256: batch.sha256,
    mapping: { ...parsed.mapping },
  }

  switch (parsed.payload.dataset) {
    case "predvaha":
      return createDraftBatch(owner, {
        ...common,
        dataset: "predvaha",
        trialBalanceLines: parsed.payload.trialBalanceLines,
      })
    case "rozvaha":
      return createDraftBatch(owner, {
        ...common,
        dataset: "rozvaha",
        statementLines: parsed.payload.statementLines,
      })
    case "vzz":
      return createDraftBatch(owner, {
        ...common,
        dataset: "vzz",
        statementLines: parsed.payload.statementLines,
      })
  }
}

/** Turn a parser refusal into the state the upload form renders. */
function csvRefusal(
  parsed: Extract<CsvDatasetResult, { ok: false }>,
): UzaverkaActionState {
  if (parsed.structural !== null) {
    return {
      status: "error",
      error: CSV_STRUCTURAL_MESSAGE_KEY[parsed.structural],
    }
  }

  if (parsed.missingColumns.length > 0) {
    return {
      status: "csv_rejected",
      error: "uzaverka.csvErrorMissingColumns",
      missingColumns: parsed.missingColumns,
      issues: [],
      hiddenIssues: 0,
    }
  }

  return {
    status: "csv_rejected",
    error: "uzaverka.csvErrorRowIssues",
    missingColumns: [],
    issues: parsed.issues.slice(0, CSV_ISSUE_LIMIT).map((issue) => ({
      line: issue.line,
      column: issue.column,
      message: CSV_ISSUE_MESSAGE_KEY[issue.code],
    })),
    hiddenIssues: Math.max(0, parsed.issues.length - CSV_ISSUE_LIMIT),
  }
}

/** The dataset a rollback names, read against the closed enum. */
const IMPORT_DATASETS: readonly BetaImportDataset[] = [
  "predvaha",
  "rozvaha",
  "vzz",
  "saldokonto",
  "payroll",
]

function formDataset(formData: FormData): BetaImportDataset | null {
  const value = formString(formData, "dataset")
  return IMPORT_DATASETS.find((dataset) => dataset === value) ?? null
}

/**
 * The period the upload targets, as the three fields the form posts.
 *
 * `ensureReportingPeriod` rather than a picker of existing periods, matching
 * `createFilingAction`: the office states the month as part of the import, and
 * a period row that exists only to be pointed at is not worth a second screen.
 */
function readPeriodFields(formData: FormData): {
  kind: NonNullable<ReturnType<typeof formPeriodKind>>
  year: number
  month: number | null
  quarter: number | null
} | null {
  const kind = formPeriodKind(formData, "periodKind")
  const year = formInteger(formData, "year", { min: 2000, max: 2100 })
  if (kind === null || year === null) return null

  const month =
    kind === "month"
      ? formInteger(formData, "month", { min: 1, max: 12 })
      : null
  const quarter =
    kind === "quarter"
      ? formInteger(formData, "quarter", { min: 1, max: 4 })
      : null
  if (
    (kind === "month" && month === null) ||
    (kind === "quarter" && quarter === null)
  ) {
    return null
  }

  return { kind, year, month, quarter }
}
