"use server"

import { revalidatePath } from "next/cache"

import { createFiling, deleteFilings, updateFiling } from "@/lib/data/filings"
import {
  createLiability,
  deleteLiabilities,
  updateLiability,
} from "@/lib/data/liabilities"
import { ensureReportingPeriod } from "@/lib/data/reporting-periods"
import { requireOwner, requireScope } from "@/lib/data/scope"
import { isCheckViolation } from "@/lib/pg-error"

import {
  formDate,
  formDecimal,
  formFilingKind,
  formFilingStatus,
  formInteger,
  formObligationGroup,
  formOptionalDate,
  formOptionalText,
  formPeriodKind,
  formString,
  formUuid,
  formVariableSymbol,
} from "./input"
import type { ProUcetniActionState } from "./state"

/**
 * Pro účetní › Zadávání dat — the writes behind spec §3.3's "ONLY editing home
 * for non-document data".
 *
 * SIX ACTIONS, TWO TABLES, ONE GATE. Every one of them opens with
 * `requireOwner(await requireScope(orgSlug))` — not because the page did it on
 * the way in, but because a Server Action is a public POST endpoint with a
 * generated name, reachable without ever rendering the page that holds its form
 * or the `pro-ucetni/layout.tsx` gate above it. `orgSlug` travels as a hidden
 * field, exactly as `saveDocumentOfficeAction` takes it.
 *
 * NO MONEY IS PARSED ANYWHERE HERE. Amounts arrive as strings, are checked for
 * SHAPE by `formDecimal`, and are handed to the data layer as the same string
 * the office typed (spec §0.2 / §0.7). The only rewrite is a Czech decimal
 * comma to a dot, which moves no digit.
 *
 * WHY THE CHECK-VIOLATION CATCH. The database is the authority on what a
 * liability may be — a positive amount, a non-blank titul, a group that is not
 * `dodavatele`. The readers above catch the ordinary typos so the office gets a
 * Czech sentence; this catch is the floor under them, so a rule enforced ONLY
 * in SQL (or one added to a later migration and not mirrored here) surfaces as a
 * refusal rather than as a 500 with a constraint name in it.
 */

async function ownerFor(formData: FormData) {
  const orgSlug = formString(formData, "orgSlug")
  return {
    orgSlug,
    owner: requireOwner(await requireScope(orgSlug)),
  }
}

/** Both surfaces this write can change: the editing hub and the client view. */
function revalidateZadavani(orgSlug: string): void {
  revalidatePath(`/${orgSlug}/pro-ucetni/zadavani`)
  revalidatePath(`/${orgSlug}/finance/dluhy-a-platby`)
}

const REJECTED: ProUcetniActionState = {
  status: "error",
  error: "zadavani.errorRejected",
}
const INVALID: ProUcetniActionState = {
  status: "error",
  error: "zadavani.errorInvalidInput",
}

/**
 * Run a write, turning a database CHECK refusal into an ordinary error state.
 *
 * Anything that is NOT a check violation is rethrown: a connection failure or a
 * genuine bug must not be reported to the office as "the database said no".
 */
async function guarded(
  write: () => Promise<ProUcetniActionState>,
): Promise<ProUcetniActionState> {
  try {
    return await write()
  } catch (error) {
    if (isCheckViolation(error)) return REJECTED
    throw error
  }
}

// ---------------------------------------------------------------------------
// Filings (spec §2.3 registry, edited here per §3.3)
// ---------------------------------------------------------------------------

/**
 * Create a filing, creating its reporting period if the organization does not
 * have that period yet.
 *
 * `ensureReportingPeriod` rather than a period picker: the office types "3/2026"
 * as part of the filing, and a separate "create the period first" step would be
 * a second form for a row that exists only to be pointed at. The upsert is
 * idempotent and scoped, so two filings for the same month share one period row.
 */
export async function createFilingAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const kind = formFilingKind(formData, "kind")
  const periodKind = formPeriodKind(formData, "periodKind")
  const dueOn = formDate(formData, "dueOn")
  const year = formInteger(formData, "year", { min: 2000, max: 2100 })
  if (kind === null || periodKind === null || dueOn === null || year === null) {
    return INVALID
  }

  const month =
    periodKind === "month"
      ? formInteger(formData, "month", { min: 1, max: 12 })
      : null
  const quarter =
    periodKind === "quarter"
      ? formInteger(formData, "quarter", { min: 1, max: 4 })
      : null
  if (
    (periodKind === "month" && month === null) ||
    (periodKind === "quarter" && quarter === null)
  ) {
    return { status: "error", error: "zadavani.errorPeriodInvalid" }
  }

  // A filing's amount is SIGN-CARRYING: a DPH nadměrný odpočet is a refund owed
  // to the client, and refusing the minus sign would make the commonest
  // construction-s.r.o. filing unenterable.
  const amount = formDecimal(formData, "amountDue", { allowNegative: true })
  if (!amount.ok) {
    return { status: "error", error: "zadavani.errorAmountInvalid" }
  }
  const variableSymbol = formVariableSymbol(formData, "variableSymbol")
  if (!variableSymbol.ok) {
    return { status: "error", error: "zadavani.errorVariableSymbolInvalid" }
  }

  const status = formFilingStatus(formData, "status")
  const filedOn = formOptionalDate(formData, "filedOn")
  if (status === null || !filedOn.ok) return INVALID

  return guarded(async () => {
    const period = await ensureReportingPeriod(owner, {
      kind: periodKind,
      year,
      month,
      quarter,
    })

    await createFiling(owner, {
      kind,
      periodId: period.id,
      dueOn,
      status,
      // `filing_filed_coherence` makes `planned` ⟺ no `filed_on` a DB rule, so
      // a date typed next to a `planned` status is dropped here rather than
      // bounced back — the office chose the status, and the date it contradicts
      // is the field that was left over from the previous entry.
      filedOn: status === "planned" ? null : filedOn.value,
      amountDue: amount.value,
      variableSymbol: variableSymbol.value,
      noteClient: formOptionalText(formData, "noteClient"),
      noteInternal: formOptionalText(formData, "noteInternal"),
    })

    revalidateZadavani(orgSlug)
    return { status: "ok", message: "zadavani.okCreated" }
  })
}

/**
 * Edit a filing's amount, deadline and filing state.
 *
 * `kind` and `period_id` are absent on purpose — `FilingPatch` does not carry
 * them either, and its own header says why: both are the row's identity, and
 * re-pointing either silently rewrites history for every surface that already
 * showed it. A mistyped filing is deleted and re-entered.
 */
export async function saveFilingAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const filingId = formUuid(formData, "filingId")
  const dueOn = formDate(formData, "dueOn")
  const status = formFilingStatus(formData, "status")
  if (filingId === null || dueOn === null || status === null) return INVALID

  const amount = formDecimal(formData, "amountDue", { allowNegative: true })
  if (!amount.ok) {
    return { status: "error", error: "zadavani.errorAmountInvalid" }
  }
  const filedOn = formOptionalDate(formData, "filedOn")
  if (!filedOn.ok) return INVALID

  return guarded(async () => {
    const saved = await updateFiling(owner, filingId, {
      dueOn,
      status,
      filedOn: status === "planned" ? null : filedOn.value,
      amountDue: amount.value,
    })
    if (!saved) return { status: "error", error: "zadavani.errorNotFound" }

    revalidateZadavani(orgSlug)
    return { status: "ok", message: "zadavani.okSaved" }
  })
}

/**
 * Mark a filing paid, or put it back among the unpaid.
 *
 * A TWO-STATE FIELD, not a checkbox: the form posts `paid=true` or
 * `paid=false` explicitly, so "the field was missing" can never be read as
 * "mark it unpaid" — the same discipline `/admin`'s activate/deactivate uses.
 * Marking paid is what removes the row from Dluhy a platby, so a silent
 * misreading here would make a debt disappear.
 */
export async function setFilingPaidAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const filingId = formUuid(formData, "filingId")
  const paid = formString(formData, "paid")
  if (filingId === null || (paid !== "true" && paid !== "false")) return INVALID

  return guarded(async () => {
    // `filing_paid_requires_amount` refuses a payment of an unstated amount, so
    // this can legitimately fail on a filing with no amount_due — `guarded`
    // turns that into the Czech refusal rather than a 500.
    const saved = await updateFiling(owner, filingId, {
      paidAt: paid === "true" ? new Date() : null,
    })
    if (!saved) return { status: "error", error: "zadavani.errorNotFound" }

    revalidateZadavani(orgSlug)
    return {
      status: "ok",
      message:
        paid === "true" ? "zadavani.okMarkedPaid" : "zadavani.okMarkedUnpaid",
    }
  })
}

export async function deleteFilingAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const filingId = formUuid(formData, "filingId")
  if (filingId === null) return INVALID

  return guarded(async () => {
    const deleted = await deleteFilings(owner, [filingId])
    if (deleted === 0)
      return { status: "error", error: "zadavani.errorNotFound" }

    revalidateZadavani(orgSlug)
    return { status: "ok", message: "zadavani.okDeleted" }
  })
}

// ---------------------------------------------------------------------------
// Manual liabilities (spec §2.4's residue, §4 "liability (residual manual only)")
// ---------------------------------------------------------------------------

/**
 * Read the fields a liability create and a liability edit share.
 *
 * One reader for both because the two forms post the same field set — a
 * liability has no identity fields the way a filing does (see `LiabilityPatch`),
 * so everything is editable and the create form is the edit form with no id.
 */
function readLiabilityFields(formData: FormData):
  | {
      ok: true
      value: {
        group: ReturnType<typeof formObligationGroup>
        label: string
        amount: string
        dueOn: string
        variableSymbol: string | null
        noteClient: string | null
        noteInternal: string | null
      }
    }
  | { ok: false; state: ProUcetniActionState } {
  const group = formObligationGroup(formData, "group")
  const dueOn = formDate(formData, "dueOn")
  if (group === null || dueOn === null) return { ok: false, state: INVALID }

  const label = formString(formData, "label")
  if (label.length === 0) {
    return {
      ok: false,
      state: { status: "error", error: "zadavani.errorLabelRequired" },
    }
  }

  // Strictly positive: money owed TO the company is a receivable (Pohledávky,
  // PR 27), not a negative debt, and `liability_amount_positive` refuses it at
  // the database anyway.
  const amount = formDecimal(formData, "amount", { required: true })
  if (!amount.ok || amount.value === null) {
    return {
      ok: false,
      state: { status: "error", error: "zadavani.errorAmountInvalid" },
    }
  }
  const variableSymbol = formVariableSymbol(formData, "variableSymbol")
  if (!variableSymbol.ok) {
    return {
      ok: false,
      state: { status: "error", error: "zadavani.errorVariableSymbolInvalid" },
    }
  }

  return {
    ok: true,
    value: {
      group,
      label,
      amount: amount.value,
      dueOn,
      variableSymbol: variableSymbol.value,
      noteClient: formOptionalText(formData, "noteClient"),
      noteInternal: formOptionalText(formData, "noteInternal"),
    },
  }
}

export async function createLiabilityAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const fields = readLiabilityFields(formData)
  if (!fields.ok) return fields.state

  return guarded(async () => {
    await createLiability(owner, {
      ...fields.value,
      group: fields.value.group ?? undefined,
    })

    revalidateZadavani(orgSlug)
    return { status: "ok", message: "zadavani.okCreated" }
  })
}

export async function saveLiabilityAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const liabilityId = formUuid(formData, "liabilityId")
  if (liabilityId === null) return INVALID

  const fields = readLiabilityFields(formData)
  if (!fields.ok) return fields.state

  return guarded(async () => {
    const saved = await updateLiability(owner, liabilityId, {
      ...fields.value,
      group: fields.value.group ?? undefined,
    })
    if (!saved) return { status: "error", error: "zadavani.errorNotFound" }

    revalidateZadavani(orgSlug)
    return { status: "ok", message: "zadavani.okSaved" }
  })
}

/** The liability twin of `setFilingPaidAction` — same two-state field, same reason. */
export async function setLiabilityPaidAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const liabilityId = formUuid(formData, "liabilityId")
  const paid = formString(formData, "paid")
  if (liabilityId === null || (paid !== "true" && paid !== "false")) {
    return INVALID
  }

  return guarded(async () => {
    const saved = await updateLiability(owner, liabilityId, {
      paidAt: paid === "true" ? new Date() : null,
    })
    if (!saved) return { status: "error", error: "zadavani.errorNotFound" }

    revalidateZadavani(orgSlug)
    return {
      status: "ok",
      message:
        paid === "true" ? "zadavani.okMarkedPaid" : "zadavani.okMarkedUnpaid",
    }
  })
}

export async function deleteLiabilityAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const liabilityId = formUuid(formData, "liabilityId")
  if (liabilityId === null) return INVALID

  return guarded(async () => {
    const deleted = await deleteLiabilities(owner, [liabilityId])
    if (deleted === 0) {
      return { status: "error", error: "zadavani.errorNotFound" }
    }

    revalidateZadavani(orgSlug)
    return { status: "ok", message: "zadavani.okDeleted" }
  })
}
