"use server"

import { revalidatePath } from "next/cache"

import { createLoan, updateLoan, type LoanWriteInput } from "@/lib/data/loans"
import { requireOwner, requireScope } from "@/lib/data/scope"
import { isCheckViolation } from "@/lib/pg-error"

import {
  formDate,
  formInstallmentPeriod,
  formLoanKind,
  formMoney,
  formOptionalMoney,
  formOptionalRate,
  formOptionalString,
  formString,
  isUuid,
} from "./input"
import type { UveryActionState } from "./state"

/**
 * Úvěry writes — owner-only (spec §3.3). `requireOwner(await
 * requireScope(orgSlug))` IS THE FIRST STATEMENT of both actions below, the
 * same pattern `majetek/_actions/assets.ts` (PR 34) established:
 * `lib/data/loans.ts`'s writes take an `OwnerScope`, so a non-owner is refused
 * before any form field is even read, not after.
 *
 * `requireScope` is called fresh in every action rather than reused from a
 * page's memoized read: a Server Action is its own request, and React's
 * `cache()` scoping in `_lib/org-scope.ts` only covers renders of the SAME
 * request.
 *
 * THE TWO BOTH-OR-NEITHER PAIRS ARE HANDLED HERE, not left to the database to
 * refuse — but the two directions are NOT symmetric. A splátka with no
 * frequency (or vice versa) is genuinely ambiguous either way, so
 * `loan_installment_coherence`'s half that cannot stand alone is dropped
 * silently, same as `createAssetAction`. A zůstatek is different: a STATED
 * figure with no as-of date is the office's own typed amount, and silently
 * dropping it would lose data the office just entered — so
 * `loan_balance_stamp_coherence` is refused with a named field error instead
 * (the same "value stated ⇒ date required" rule
 * `publishSaldokontoSchema` in `lib/agent/schemas.ts` applies to a stated
 * payable and its splatnost). An orphan date with no figure is still noise
 * and is still dropped, never refused.
 */

const INVALID: UveryActionState = {
  status: "error",
  error: "uvery.errorInvalidInput",
}

/**
 * Any `loan_*` CHECK this file's own validation does not pre-empt (a race, a
 * future column, `loan_interest_rate_range`) becomes this Czech sentence
 * instead of the raw constraint reaching the client as a 500 — the same
 * `guarded` idiom `pro-ucetni/_actions/partners.ts` and `zadavani.ts` use.
 */
async function guarded(
  write: () => Promise<UveryActionState>,
): Promise<UveryActionState> {
  try {
    return await write()
  } catch (error) {
    if (isCheckViolation(error)) {
      return { status: "error", error: "uvery.errorRejected" }
    }
    throw error
  }
}

/** Everything both actions read, or the named field error when it is unusable. */
function readLoanForm(
  formData: FormData,
):
  { ok: true; value: LoanWriteInput } | { ok: false; state: UveryActionState } {
  const institution = formString(formData, "institution")
  const loanKind = formLoanKind(formData, "loanKind")
  const principal = formMoney(formData, "principal")
  if (institution.length === 0 || !loanKind || principal === null) {
    return { ok: false, state: INVALID }
  }

  const balance = formOptionalMoney(formData, "balance")
  const installment = formOptionalMoney(formData, "installment")
  const installmentPeriod = formInstallmentPeriod(formData, "installmentPeriod")
  const interestRatePct = formOptionalRate(formData, "interestRatePct")
  if (
    balance === undefined ||
    installment === undefined ||
    installmentPeriod === undefined ||
    interestRatePct === undefined
  ) {
    return { ok: false, state: INVALID }
  }

  const balanceAsOf = formDate(formData, "balanceAsOf")
  // `loan_balance_stamp_coherence`: a stated zůstatek with no as-of date would
  // otherwise reach the database and crash on the CHECK. Named here, before
  // either that or a silent drop of the office's own figure can happen.
  if (balance !== null && balanceAsOf === null) {
    return {
      ok: false,
      state: { status: "error", error: "uvery.errorBalanceAsOfRequired" },
    }
  }

  return {
    ok: true,
    value: {
      institution,
      loanKind,
      principal,
      balance,
      // The orphan-date direction is still noise and is still dropped — the
      // stated-value direction is refused above, never silently dropped.
      balanceAsOf: balance === null ? null : balanceAsOf,
      // ... and a splátka only next to its frequency (spec §2.4).
      installment: installmentPeriod === null ? null : installment,
      installmentPeriod: installment === null ? null : installmentPeriod,
      interestRatePct,
      endsOn: formDate(formData, "endsOn"),
      noteClient: formOptionalString(formData, "noteClient"),
    },
  }
}

export async function createLoanAction(
  _previous: UveryActionState,
  formData: FormData,
): Promise<UveryActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const fields = readLoanForm(formData)
  if (!fields.ok) return fields.state

  return guarded(async () => {
    await createLoan(owner, fields.value)

    revalidatePath(`/${orgSlug}/finance/uvery`)
    return { status: "ok", message: "uvery.okCreated" }
  })
}

export async function updateLoanAction(
  _previous: UveryActionState,
  formData: FormData,
): Promise<UveryActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const loanId = formString(formData, "loanId")
  if (!isUuid(loanId)) return { status: "error", error: "uvery.errorNotFound" }

  const fields = readLoanForm(formData)
  if (!fields.ok) return fields.state

  return guarded(async () => {
    const updated = await updateLoan(owner, loanId, fields.value)
    if (!updated) return { status: "error", error: "uvery.errorNotFound" }

    revalidatePath(`/${orgSlug}/finance/uvery`)
    return { status: "ok", message: "uvery.okUpdated" }
  })
}
