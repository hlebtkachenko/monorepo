"use server"

import { createHash } from "node:crypto"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import type { BetaImportDataset } from "@/db/schema"
import {
  addPartnerSaldoRow,
  addPayrollLineToBatch,
  createDraftBatch,
  deleteDraftBatch,
  deletePartnerSaldoRow,
  deletePayrollLineFromBatch,
  officeBatchFor,
  publishBatch,
  rollbackDataset,
  updatePartnerSaldoRow,
  updatePayrollLineInBatch,
  type PartnerSaldoLineInput,
  type PayrollLineInput,
  type PayrollSummaryInput,
} from "@/lib/data/imports"
import { ensureReportingPeriod } from "@/lib/data/reporting-periods"
import { requireOwner, requireScope, type OwnerScope } from "@/lib/data/scope"
import {
  isCheckViolation,
  isForeignKeyViolation,
  isUniqueViolation,
} from "@/lib/pg-error"
import {
  isCsvDataset,
  readDatasetCsv,
  type CsvDatasetResult,
} from "@/lib/import/datasets"

import {
  formDecimal,
  formInteger,
  formOptionalDate,
  formOptionalText,
  formPeriodKind,
  formString,
  formUuid,
} from "./input"
import {
  CSV_ISSUE_LIMIT,
  CSV_ISSUE_MESSAGE_KEY,
  CSV_STRUCTURAL_MESSAGE_KEY,
  type StartManualBatchState,
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

// ---------------------------------------------------------------------------
// The manual batch start (manual-entry plan §3, W1) — an EMPTY draft, rows
// added afterwards on its own preview
// ---------------------------------------------------------------------------

/**
 * Datasets `startManualBatchAction` may open with an EMPTY payload.
 *
 * `payroll` IS DELIBERATELY A SEPARATE, WIDER LIST (`MANUAL_START_DATASETS`
 * below). `ImportBatchPayload`'s payroll arm makes `payrollSummary` REQUIRED
 * (`imports.ts`'s own comment states why: a payroll batch with lines and no
 * summary would render Přehled mezd and Zaměstnanci disagreeing about
 * whether the period exists), so an EMPTY payroll batch is not a value this
 * type can express — `emptyManualBatch` therefore stays exhaustive over the
 * four datasets that CAN start empty, and `startManualBatchAction` (W4)
 * branches to its own `createDraftBatch` call, carrying a real summary, for
 * the fifth.
 */
const EMPTY_MANUAL_START_DATASETS = [
  "predvaha",
  "rozvaha",
  "vzz",
  "saldokonto",
] as const

type EmptyManualStartDataset = (typeof EMPTY_MANUAL_START_DATASETS)[number]

/** The full set a "start a manual batch" form may post — the four empty-startable datasets plus payroll. */
const MANUAL_START_DATASETS = [
  ...EMPTY_MANUAL_START_DATASETS,
  "payroll",
] as const

type ManualStartDataset = (typeof MANUAL_START_DATASETS)[number]

function formManualStartDataset(formData: FormData): ManualStartDataset | null {
  const value = formString(formData, "dataset")
  return MANUAL_START_DATASETS.find((dataset) => dataset === value) ?? null
}

/**
 * An empty payload for one of the four datasets above.
 *
 * A `switch` over the literal dataset, mirroring `writeDraft`'s own: spreading
 * a generic object into `ImportBatchInput` would launder the exact guarantee
 * that discriminated union exists to give — a dataset paired with the WRONG
 * array is a compile error here, not a runtime one.
 */
function emptyManualBatch(
  owner: OwnerScope,
  dataset: EmptyManualStartDataset,
  periodId: string,
): ReturnType<typeof createDraftBatch> {
  const common = { periodId, source: "manual" as const }
  switch (dataset) {
    case "predvaha":
      return createDraftBatch(owner, {
        ...common,
        dataset,
        trialBalanceLines: [],
      })
    case "rozvaha":
    case "vzz":
      return createDraftBatch(owner, {
        ...common,
        dataset,
        statementLines: [],
      })
    case "saldokonto":
      return createDraftBatch(owner, {
        ...common,
        dataset,
        partnerSaldoLines: [],
      })
  }
}

/**
 * The payroll summary fields a "start a payroll batch" form posts
 * (manual-entry plan §3, W4) — the twelve office-stated totals of
 * `PayrollSummaryInput`, every one of them optional (§0.4: an unknown is not
 * a zero). Malformed shape on ANY field refuses the whole form, the same
 * all-or-nothing reading `readLoanForm` gives its own both-or-neither pairs.
 */
function readPayrollSummaryFields(
  formData: FormData,
): PayrollSummaryInput | null {
  const grossTotal = formDecimal(formData, "grossTotal")
  const employerSocial = formDecimal(formData, "employerSocial")
  const employerHealth = formDecimal(formData, "employerHealth")
  const employerCostTotal = formDecimal(formData, "employerCostTotal")
  const employeeWithholdingsTotal = formDecimal(
    formData,
    "employeeWithholdingsTotal",
  )
  const incomeTaxAdvance = formDecimal(formData, "incomeTaxAdvance")
  const netPaidTotal = formDecimal(formData, "netPaidTotal")
  const paymentDueDate = formOptionalDate(formData, "paymentDueDate")

  if (
    !grossTotal.ok ||
    !employerSocial.ok ||
    !employerHealth.ok ||
    !employerCostTotal.ok ||
    !employeeWithholdingsTotal.ok ||
    !incomeTaxAdvance.ok ||
    !netPaidTotal.ok ||
    !paymentDueDate.ok
  ) {
    return null
  }

  return {
    grossTotal: grossTotal.value,
    employerSocial: employerSocial.value,
    employerHealth: employerHealth.value,
    employerCostTotal: employerCostTotal.value,
    employeeWithholdingsTotal: employeeWithholdingsTotal.value,
    incomeTaxAdvance: incomeTaxAdvance.value,
    netPaidTotal: netPaidTotal.value,
    paymentDueDate: paymentDueDate.value,
    headcountHpp: formInteger(formData, "headcountHpp", { min: 0, max: 9999 }),
    headcountDpc: formInteger(formData, "headcountDpc", { min: 0, max: 9999 }),
    headcountDpp: formInteger(formData, "headcountDpp", { min: 0, max: 9999 }),
    noteClient: formOptionalText(formData, "noteClient"),
  }
}

/**
 * What `startManualBatchAction` is about to create, resolved from the FORM —
 * a discriminated union rather than a bare `EmptyManualStartDataset |
 * "payroll"` plus a nullable summary, so the caller narrows `payload.dataset
 * === "payroll"` and gets `payload.summary` typed, with no cast.
 */
type ManualStartPayload =
  | { dataset: EmptyManualStartDataset }
  | { dataset: "payroll"; summary: PayrollSummaryInput }

function resolveManualStartPayload(
  dataset: ManualStartDataset,
  formData: FormData,
): ManualStartPayload | null {
  if (dataset !== "payroll") return { dataset }
  const summary = readPayrollSummaryFields(formData)
  return summary === null ? null : { dataset, summary }
}

/**
 * Start a manual batch, and send the office straight to its rows — the
 * `uploadCsvBatchAction` idiom above with the file step removed.
 *
 * FOUR DATASETS START EMPTY (§ above `emptyManualBatch`); `payroll` CANNOT
 * (its summary is required by `ImportBatchPayload`), so this form carries the
 * twelve summary fields alongside the period ones, and `payrollLines` starts
 * at `[]` — the lines are added afterwards, on the batch's own preview
 * (manual-entry plan §3, W4).
 *
 * AN EMPTY DRAFT IS OTHERWISE A LEGAL DRAFT: `createDraftBatch` only inserts a
 * dataset's rows `if (length > 0)`, so an empty start needs no special case at
 * the data layer — exactly the property the plan's W1 section confirms before
 * relying on it. `row_count` lands at `0` (or `1` for a bare payroll summary,
 * `batchRowCount`'s own rule), which the completeness matrix already renders
 * correctly (a draft with nothing published yet).
 *
 * NEVER PUBLISHES, same as the CSV fallback: the batch stays invisible to
 * every client until the office adds rows on its own preview and clicks
 * publish there.
 */
export async function startManualBatchAction(
  _previous: UzaverkaActionState,
  formData: FormData,
): Promise<StartManualBatchState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const dataset = formManualStartDataset(formData)
  if (dataset === null) {
    return { status: "error", error: "uzaverka.errorInvalidInput" }
  }

  const period = readPeriodFields(formData)
  if (period === null) {
    return { status: "error", error: "uzaverka.errorPeriodInvalid" }
  }

  // Read (and refuse a malformed) payroll summary BEFORE touching the
  // database — the same ordering `uploadCsvBatchAction` uses for its own
  // parse-then-persist shape, so a doomed request never creates a period as
  // a side effect of a form it is about to refuse anyway.
  const payload = resolveManualStartPayload(dataset, formData)
  if (payload === null) {
    return { status: "error", error: "uzaverka.errorInvalidInput" }
  }

  let draftId: string
  try {
    const reportingPeriod = await ensureReportingPeriod(owner, period)
    const draft =
      payload.dataset === "payroll"
        ? await createDraftBatch(owner, {
            periodId: reportingPeriod.id,
            source: "manual",
            dataset: "payroll",
            payrollSummary: payload.summary,
            payrollLines: [],
          })
        : await emptyManualBatch(owner, payload.dataset, reportingPeriod.id)
    draftId = draft.id
  } catch (error) {
    if (isCheckViolation(error)) {
      return { status: "error", error: "uzaverka.errorRejected" }
    }
    throw error
  }

  revalidateUzaverka(orgSlug)
  // OUTSIDE the try, for the same reason `uploadCsvBatchAction` states it:
  // `redirect` throws, and catching it alongside the database refusals above
  // would turn a successful start into an error about a constraint that was
  // never violated.
  redirect(`/${orgSlug}/pro-ucetni/uzaverka/${draftId}`)
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

// ---------------------------------------------------------------------------
// The saldokonto row drawer (manual-entry plan §3, W2) — add / edit / remove
// ONE partner on an EXISTING draft batch, the row-level counterpart to
// `startManualBatchAction`'s empty start above.
// ---------------------------------------------------------------------------

/**
 * A stated total that reads as zero — `"0"`, `"0.0"`, `"0.00"`, the only forms
 * `formDecimal`'s own shape check lets through. Matches
 * `partner_saldo_payable_has_oldest_due`'s own `payable_total = 0` exception
 * exactly: a settled supplier owes no deadline. `Number(...)` is deliberately
 * NOT used for this — this module keeps money as the string the office typed,
 * never a float, even for a comparison that never reaches Postgres.
 */
const ZERO_DECIMAL = /^0(\.0{1,2})?$/

/**
 * `INVALID` narrowed to `StartManualBatchState` — `INVALID` itself is typed as
 * the WIDER `UzaverkaActionState` (it is shared with `publishBatchAction` and
 * friends, whose `csv_rejected` arm this file's row actions never produce), so
 * it is not assignable to the narrower return type `EntrySheet` requires. Same
 * split `START_MANUAL_BATCH_IDLE` makes against `UZAVERKA_ACTION_IDLE`.
 */
const SALDO_ROW_INVALID: StartManualBatchState = {
  status: "error",
  error: "uzaverka.errorInvalidInput",
}

/** Everything all three row actions read, or the Czech refusal the form gets back. */
function readSaldoRowForm(
  formData: FormData,
):
  | { ok: true; value: PartnerSaldoLineInput }
  | { ok: false; error: StartManualBatchState & { status: "error" } } {
  const partnerId = formUuid(formData, "partnerId")
  const receivable = formDecimal(formData, "receivableTotal")
  const payable = formDecimal(formData, "payableTotal")
  const oldestDue = formOptionalDate(formData, "oldestDue")

  if (partnerId === null || !receivable.ok || !payable.ok || !oldestDue.ok) {
    return {
      ok: false,
      error: { status: "error", error: "uzaverka.saldoRowErrorInvalidInput" },
    }
  }

  // `partner_saldo_states_something` — resolved HERE, matching `loans.ts`'s
  // own both-or-neither pairs, so the office reads a Czech sentence about the
  // row it just typed rather than a database refusal on submit.
  if (receivable.value === null && payable.value === null) {
    return {
      ok: false,
      error: {
        status: "error",
        error: "uzaverka.saldoRowErrorStatesNothing",
      },
    }
  }

  // `partner_saldo_payable_has_oldest_due` — a stated, NON-ZERO payable
  // carries the date it is due.
  if (
    payable.value !== null &&
    !ZERO_DECIMAL.test(payable.value) &&
    oldestDue.value === null
  ) {
    return {
      ok: false,
      error: {
        status: "error",
        error: "uzaverka.saldoRowErrorPayableNeedsOldestDue",
      },
    }
  }

  return {
    ok: true,
    value: {
      partnerId,
      receivableTotal: receivable.value,
      payableTotal: payable.value,
      oldestDue: oldestDue.value,
    },
  }
}

/**
 * Add or edit's own guard: `partner_saldo_identity_unique` (one row per
 * partner per batch) is a UNIQUE index, not a CHECK, so it fails
 * `isCheckViolation` and needs its own arm alongside `guarded()`'s. A
 * dedicated helper rather than widening `guarded()` itself — `publishBatch`
 * and `rollbackDataset` already turn their own unique-index races into a typed
 * `PublishOutcome`/`RollbackOutcome` before `guarded()` ever sees them, so no
 * existing caller of `guarded()` needs a second arm it would never take.
 */
async function guardedSaldoRowWrite(
  write: () => Promise<StartManualBatchState>,
): Promise<StartManualBatchState> {
  try {
    return await write()
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: "error", error: "uzaverka.saldoRowErrorDuplicate" }
    }
    if (isCheckViolation(error)) {
      return { status: "error", error: "uzaverka.errorRejected" }
    }
    throw error
  }
}

/** Every path that touches a saldokonto batch's rows. */
function revalidateSaldoBatch(orgSlug: string, batchId: string): void {
  revalidateUzaverka(orgSlug)
  revalidatePath(`/${orgSlug}/pro-ucetni/uzaverka/${batchId}`)
}

export async function addPartnerSaldoRowAction(
  _previous: StartManualBatchState,
  formData: FormData,
): Promise<StartManualBatchState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const batchId = formUuid(formData, "batchId")
  if (batchId === null) return SALDO_ROW_INVALID

  const fields = readSaldoRowForm(formData)
  if (!fields.ok) return fields.error

  return guardedSaldoRowWrite(async () => {
    const row = await addPartnerSaldoRow(owner, batchId, fields.value)
    if (!row) {
      return { status: "error", error: "uzaverka.saldoRowErrorNotEditable" }
    }

    revalidateSaldoBatch(orgSlug, batchId)
    return { status: "ok", message: "uzaverka.saldoRowOkAdded" }
  })
}

export async function updatePartnerSaldoRowAction(
  _previous: StartManualBatchState,
  formData: FormData,
): Promise<StartManualBatchState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const batchId = formUuid(formData, "batchId")
  const rowId = formUuid(formData, "rowId")
  if (batchId === null || rowId === null) return SALDO_ROW_INVALID

  const fields = readSaldoRowForm(formData)
  if (!fields.ok) return fields.error

  return guardedSaldoRowWrite(async () => {
    const updated = await updatePartnerSaldoRow(
      owner,
      batchId,
      rowId,
      fields.value,
    )
    if (!updated) {
      return { status: "error", error: "uzaverka.saldoRowErrorNotEditable" }
    }

    revalidateSaldoBatch(orgSlug, batchId)
    return { status: "ok", message: "uzaverka.saldoRowOkUpdated" }
  })
}

/**
 * Remove one partner from a draft batch.
 *
 * NO `guardedSaldoRowWrite` HERE. `deletePartnerSaldoRow`'s own header states
 * why: unlike INSERT/UPDATE, a DELETE is not covered by
 * `beta_import_line_requires_draft_batch`, so the data layer takes the draft
 * check itself and reports "not editable" as an ordinary `false`, never a
 * thrown exception — there is nothing here for a catch block to translate.
 */
export async function deletePartnerSaldoRowAction(
  _previous: StartManualBatchState,
  formData: FormData,
): Promise<StartManualBatchState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const batchId = formUuid(formData, "batchId")
  const rowId = formUuid(formData, "rowId")
  if (batchId === null || rowId === null) return SALDO_ROW_INVALID

  const deleted = await deletePartnerSaldoRow(owner, batchId, rowId)
  if (!deleted) {
    return { status: "error", error: "uzaverka.saldoRowErrorNotEditable" }
  }

  revalidateSaldoBatch(orgSlug, batchId)
  return { status: "ok", message: "uzaverka.saldoRowOkDeleted" }
}

// ---------------------------------------------------------------------------
// Payroll lines (manual-entry plan §3, W4) — the batch preview's own writes,
// once a payroll draft has been started above
// ---------------------------------------------------------------------------

/**
 * The draft payroll batch `batchId` names, or `null` if it is not one this
 * owner may add a line to — unknown, another organization's, the wrong
 * dataset, or no longer a draft. ONE CHECK for all three payroll line
 * actions, so "unpublishable" always means the same thing regardless of
 * which of the three found it.
 */
async function draftPayrollBatchFor(
  owner: OwnerScope,
  batchId: string,
): Promise<{ id: string; periodId: string } | null> {
  const batch = await officeBatchFor(owner, batchId)
  if (!batch || batch.dataset !== "payroll" || batch.status !== "draft") {
    return null
  }
  return { id: batch.id, periodId: batch.period.id }
}

/** Everything `addPayrollLineAction`/`updatePayrollLineAction` read, or the refusal the sheet gets back. */
function readPayrollLineForm(
  formData: FormData,
): { ok: true; value: PayrollLineInput } | { ok: false } {
  const payrollEmployeeId = formUuid(formData, "payrollEmployeeId")
  if (payrollEmployeeId === null) return { ok: false }

  const gross = formDecimal(formData, "gross")
  const deductionsTotal = formDecimal(formData, "deductionsTotal")
  const net = formDecimal(formData, "net")
  const employerCost = formDecimal(formData, "employerCost")
  if (!gross.ok || !deductionsTotal.ok || !net.ok || !employerCost.ok) {
    return { ok: false }
  }

  return {
    ok: true,
    value: {
      payrollEmployeeId,
      gross: gross.value,
      deductionsTotal: deductionsTotal.value,
      net: net.value,
      employerCost: employerCost.value,
    },
  }
}

/**
 * Like `guarded()` above, but also translates the two refusals payroll line
 * actions can hit that no other write in this file can:
 * `payrollEmployeeId` naming a register row outside this organization
 * (`payroll_employee_line_employee_fk`, migration 0016, 23503), and a second
 * line for an employee already in this batch
 * (`payroll_employee_line_identity_unique`, a real SQL `UNIQUE`, 23505 —
 * unlike every OTHER guard in this file, which is a trigger `RAISE` and
 * therefore always 23514). `guarded()` itself is left untouched rather than
 * widened, so every OTHER caller's silence on 23503/23505 stays a deliberate
 * "cannot happen here" rather than an accident.
 */
async function guardedRow(
  write: () => Promise<StartManualBatchState>,
): Promise<StartManualBatchState> {
  try {
    return await write()
  } catch (error) {
    if (isCheckViolation(error)) {
      return { status: "error", error: "uzaverka.errorRejected" }
    }
    if (isForeignKeyViolation(error)) {
      return { status: "error", error: "mzdyZadani.errorUnknownEmployee" }
    }
    if (isUniqueViolation(error)) {
      return {
        status: "error",
        error: "mzdyZadani.errorEmployeeAlreadyInBatch",
      }
    }
    throw error
  }
}

export async function addPayrollLineAction(
  _previous: UzaverkaActionState,
  formData: FormData,
): Promise<StartManualBatchState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const batchId = formUuid(formData, "batchId")
  if (batchId === null)
    return { status: "error", error: "uzaverka.errorInvalidInput" }

  const batch = await draftPayrollBatchFor(owner, batchId)
  if (!batch) return { status: "error", error: "uzaverka.errorUnknownBatch" }

  const fields = readPayrollLineForm(formData)
  if (!fields.ok) {
    return { status: "error", error: "uzaverka.errorInvalidInput" }
  }

  return guardedRow(async () => {
    await addPayrollLineToBatch(owner, batch.id, batch.periodId, fields.value)
    revalidatePath(`/${orgSlug}/pro-ucetni/uzaverka/${batch.id}`)
    return { status: "ok", message: "mzdyZadani.okLineAdded" }
  })
}

export async function updatePayrollLineAction(
  _previous: UzaverkaActionState,
  formData: FormData,
): Promise<StartManualBatchState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const batchId = formUuid(formData, "batchId")
  const lineId = formUuid(formData, "lineId")
  if (batchId === null || lineId === null) {
    return { status: "error", error: "uzaverka.errorInvalidInput" }
  }

  const batch = await draftPayrollBatchFor(owner, batchId)
  if (!batch) return { status: "error", error: "uzaverka.errorUnknownBatch" }

  const fields = readPayrollLineForm(formData)
  if (!fields.ok) {
    return { status: "error", error: "uzaverka.errorInvalidInput" }
  }

  return guardedRow(async () => {
    const updated = await updatePayrollLineInBatch(
      owner,
      batch.id,
      lineId,
      fields.value,
    )
    if (!updated) {
      return { status: "error", error: "mzdyZadani.errorLineNotFound" }
    }
    revalidatePath(`/${orgSlug}/pro-ucetni/uzaverka/${batch.id}`)
    return { status: "ok", message: "mzdyZadani.okLineUpdated" }
  })
}

/** Draft batches only — matches `ConfirmActionForm`'s own `UzaverkaActionState` action type. */
export async function deletePayrollLineAction(
  _previous: UzaverkaActionState,
  formData: FormData,
): Promise<UzaverkaActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const batchId = formUuid(formData, "batchId")
  const lineId = formUuid(formData, "lineId")
  if (batchId === null || lineId === null) return INVALID

  const batch = await draftPayrollBatchFor(owner, batchId)
  if (!batch) return { status: "error", error: "uzaverka.errorUnknownBatch" }

  const deleted = await deletePayrollLineFromBatch(owner, batch.id, lineId)
  if (!deleted) {
    return { status: "error", error: "mzdyZadani.errorLineNotFound" }
  }

  revalidatePath(`/${orgSlug}/pro-ucetni/uzaverka/${batch.id}`)
  return { status: "ok", message: "mzdyZadani.okLineDeleted" }
}
