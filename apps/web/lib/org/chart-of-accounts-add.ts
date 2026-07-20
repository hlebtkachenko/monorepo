/**
 * Pure form logic for "add account" (Batch C2). Kept framework-free so the number
 * shape + required-field rules unit-test in the Node runner without rendering the
 * client form or booting a DB. The client add-form (chart-of-accounts-view) owns
 * the inputs; the server action (chart-of-accounts/page) consumes {@link AddAccountInput}.
 */

/** The account `nature` (raw enum) the user picks — drives the derived statement
 *  class / type / normal side server-side. Mirrors the `account_nature` pg enum. */
export type AccountNature =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "EXPENSE"
  | "REVENUE"
  | "CLOSING"
  | "OFF_BALANCE"

export const ACCOUNT_NATURES: readonly AccountNature[] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "EXPENSE",
  "REVENUE",
  "CLOSING",
  "OFF_BALANCE",
]

/** Synthetic (3-digit) or analytical (3-digit + `.suffix`) number, e.g. `311` or `311.001`. */
const ACCOUNT_NUMBER_RE = /^\d{3}(\.\d+)?$/

/** The raw form state the client add-panel holds (all strings — the shape a set of
 *  controlled inputs / selects produce). Empty string = "not chosen". */
export interface AddAccountForm {
  parentId: string
  number: string
  name: string
  nature: AccountNature | ""
  normalBalance: "DEBIT" | "CREDIT" | ""
  tracksOpenItems: "yes" | "no"
  /** yes / no / "none" (the F3 clear option → null). */
  taxRelevant: "yes" | "no" | "none"
}

/** The clean patch the server action sends to `addChartAccount`. */
export interface AddAccountInput {
  parentId: string | null
  number: string
  name: string
  nature: AccountNature
  normalBalance?: "DEBIT" | "CREDIT"
  tracksOpenItems: boolean
  taxRelevant: boolean | null
}

type AddAccountErrorKey = "number" | "name" | "nature"
export type AddAccountErrors = Partial<Record<AddAccountErrorKey, true>>

export const EMPTY_ADD_ACCOUNT_FORM: AddAccountForm = {
  parentId: "",
  number: "",
  name: "",
  nature: "",
  normalBalance: "",
  tracksOpenItems: "no",
  taxRelevant: "none",
}

/** Boundary validation (user input): number shape, non-empty name, a chosen nature. */
export function validateAddForm(form: AddAccountForm): AddAccountErrors {
  const errors: AddAccountErrors = {}
  if (!ACCOUNT_NUMBER_RE.test(form.number.trim())) errors.number = true
  if (form.name.trim() === "") errors.name = true
  if (form.nature === "") errors.nature = true
  return errors
}

export function isAddFormValid(form: AddAccountForm): boolean {
  return Object.keys(validateAddForm(form)).length === 0
}

/**
 * Map a VALID form to the server-action input. Throws if the form is invalid —
 * callers gate on {@link isAddFormValid} first, so this only narrows the string
 * unions to the domain types (empty selects drop to null / undefined).
 */
export function toAddAccountInput(form: AddAccountForm): AddAccountInput {
  if (form.nature === "")
    throw new Error("toAddAccountInput: nature is required")
  return {
    parentId: form.parentId === "" ? null : form.parentId,
    number: form.number.trim(),
    name: form.name.trim(),
    nature: form.nature,
    normalBalance: form.normalBalance === "" ? undefined : form.normalBalance,
    tracksOpenItems: form.tracksOpenItems === "yes",
    taxRelevant:
      form.taxRelevant === "none" ? null : form.taxRelevant === "yes",
  }
}
