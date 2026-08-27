"use server"

import { revalidatePath } from "next/cache"

import type { BetaMessageKey } from "@/i18n/messages"
import {
  createPayrollEmployee,
  updatePayrollEmployee,
  type PayrollEmployeeWriteInput,
} from "@/lib/data/payroll"
import { requireOwner, requireScope } from "@/lib/data/scope"

import {
  formBooleanChoice,
  formContractType,
  formDate,
  formString,
  formUuid,
} from "./input"
import type { EmployeeActionState } from "./employee-state"

/**
 * Zaměstnanci's register writes (manual-entry plan §3.3, W3) — owner-only.
 * `requireOwner(await requireScope(orgSlug))` IS THE FIRST STATEMENT of both
 * actions, the same pattern `finance/uvery/_actions/loans.ts` established:
 * `lib/data/payroll.ts`'s `createPayrollEmployee`/`updatePayrollEmployee` both
 * take an `OwnerScope`, so a non-owner — including an employee seat, whose
 * membership role is never `"owner"` — is refused before any field is read.
 *
 * `external_ref` HAS NO READER HERE, and there is no field for it in
 * `EmployeeFields` either. The schema header and `PayrollEmployeePatch`'s own
 * doc comment are both explicit: a hand-typed row stays outside the agent's
 * partial unique index by construction, and binding the OTHER identity column
 * this table carries (`app_user_id`, the employee-seat link) is not something
 * any write path but the seat-invite consumption may do — see migration 0019.
 */

type EmployeeFormResult =
  | { ok: true; value: PayrollEmployeeWriteInput }
  | { ok: false; error: BetaMessageKey }

/** Everything both actions read, or the Czech refusal the form gets back. */
function readEmployeeForm(formData: FormData): EmployeeFormResult {
  const fullName = formString(formData, "fullName")
  const contractType = formContractType(formData, "contractType")
  const active = formBooleanChoice(formData, "active")
  if (fullName.length === 0 || !contractType || active === null) {
    return { ok: false, error: "mzdy.errorInvalidInput" }
  }

  const startedOn = formDate(formData, "startedOn")
  const endedOn = formDate(formData, "endedOn")
  // An employment cannot end before it began
  // (`payroll_employee_employment_dates_ordered`) — resolved HERE, not left to
  // the database to refuse, the same shape `loans.ts`'s `readLoanForm`
  // resolves its own both-or-neither pairs in.
  if (startedOn && endedOn && endedOn < startedOn) {
    return { ok: false, error: "mzdy.errorInvalidDates" }
  }

  return {
    ok: true,
    value: { fullName, contractType, startedOn, endedOn, active },
  }
}

export async function createPayrollEmployeeAction(
  _previous: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const fields = readEmployeeForm(formData)
  if (!fields.ok) return { status: "error", error: fields.error }

  await createPayrollEmployee(owner, fields.value)

  revalidatePath(`/${orgSlug}/mzdy/zamestnanci`)
  return { status: "ok", message: "mzdy.okCreated" }
}

export async function updatePayrollEmployeeAction(
  _previous: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const employeeId = formUuid(formData, "employeeId")
  if (!employeeId) return { status: "error", error: "mzdy.errorNotFound" }

  const fields = readEmployeeForm(formData)
  if (!fields.ok) return { status: "error", error: fields.error }

  const updated = await updatePayrollEmployee(owner, employeeId, fields.value)
  if (!updated) return { status: "error", error: "mzdy.errorNotFound" }

  revalidatePath(`/${orgSlug}/mzdy/zamestnanci`)
  return { status: "ok", message: "mzdy.okUpdated" }
}
