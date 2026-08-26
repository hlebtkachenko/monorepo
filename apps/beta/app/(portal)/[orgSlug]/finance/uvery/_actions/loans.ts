"use server"

import { revalidatePath } from "next/cache"

import { createLoan, updateLoan, type LoanWriteInput } from "@/lib/data/loans"
import { requireOwner, requireScope } from "@/lib/data/scope"

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
 * THE TWO BOTH-OR-NEITHER PAIRS ARE RESOLVED HERE, not left to the database to
 * refuse. A zůstatek with no as-of date and a splátka with no frequency are
 * both incoherent (`loan_balance_stamp_coherence`,
 * `loan_installment_coherence`), so the half that cannot stand alone is dropped
 * — the same resolution `createAssetAction` applies to oprávky and their stamp.
 */

/** Everything both actions read, or `null` when the form is unusable. */
function readLoanForm(formData: FormData): LoanWriteInput | null {
  const institution = formString(formData, "institution")
  const loanKind = formLoanKind(formData, "loanKind")
  const principal = formMoney(formData, "principal")
  if (institution.length === 0 || !loanKind || principal === null) return null

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
    return null
  }

  const balanceAsOf = formDate(formData, "balanceAsOf")

  return {
    institution,
    loanKind,
    principal,
    balance,
    // A zůstatek is only readable next to the date it is AS OF (spec §0.4).
    balanceAsOf: balance === null ? null : balanceAsOf,
    // ... and a splátka only next to its frequency (spec §2.4).
    installment: installmentPeriod === null ? null : installment,
    installmentPeriod: installment === null ? null : installmentPeriod,
    interestRatePct,
    endsOn: formDate(formData, "endsOn"),
    noteClient: formOptionalString(formData, "noteClient"),
  }
}

export async function createLoanAction(
  _previous: UveryActionState,
  formData: FormData,
): Promise<UveryActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const input = readLoanForm(formData)
  if (!input) return { status: "error", error: "uvery.errorInvalidInput" }

  await createLoan(owner, input)

  revalidatePath(`/${orgSlug}/finance/uvery`)
  return { status: "ok", message: "uvery.okCreated" }
}

export async function updateLoanAction(
  _previous: UveryActionState,
  formData: FormData,
): Promise<UveryActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const loanId = formString(formData, "loanId")
  if (!isUuid(loanId)) return { status: "error", error: "uvery.errorNotFound" }

  const input = readLoanForm(formData)
  if (!input) return { status: "error", error: "uvery.errorInvalidInput" }

  const updated = await updateLoan(owner, loanId, input)
  if (!updated) return { status: "error", error: "uvery.errorNotFound" }

  revalidatePath(`/${orgSlug}/finance/uvery`)
  return { status: "ok", message: "uvery.okUpdated" }
}
