/**
 * Úvěry writes' pair-validation and CHECK-fallback boundary (QA sweep
 * regression: "Nová smlouva" with Zůstatek filled and Zůstatek k datu empty
 * used to crash with an unhandled `loan_balance_stamp_coherence` CHECK
 * violation — a raw Next error overlay rather than a form the office could
 * fix).
 *
 * `createLoanAction` / `updateLoanAction` now refuse the stated-value
 * direction of the pair with a NAMED field error before either write ever
 * reaches `lib/data/loans.ts` — see `readLoanForm` in `./loans.ts`. This file
 * proves that refusal for both create and update, that the orphan-date
 * direction is still silently dropped (never refused — it carries no data to
 * lose), and that any CHECK this file's own validation does not pre-empt
 * still comes back as a Czech sentence through `guarded`, never a crash.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}))

const { createLoanAction, updateLoanAction } = await import("./loans")
const { requireScope } = await import("@/lib/data/scope")
const { loansForScope } = await import("@/lib/data/loans")

const IDLE = { status: "idle" } as const

function as(headers: Headers): void {
  request.headers = headers
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("loan_balance_stamp_coherence — refused, never crashed or silently dropped", () => {
  it("refuses a create with a zůstatek and no as-of date, naming the field", async () => {
    as(org.members.owner.headers)

    const result = await createLoanAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        institution: "Refuse na create",
        loanKind: "loan",
        principal: "100000.00",
        balance: "80000.00",
      }),
    )

    expect(result).toEqual({
      status: "error",
      error: "uvery.errorBalanceAsOfRequired",
    })
  })

  it("accepts a create with a zůstatek AND its as-of date", async () => {
    as(org.members.owner.headers)

    const result = await createLoanAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        institution: "Accept na create",
        loanKind: "loan",
        principal: "100000.00",
        balance: "80000.00",
        balanceAsOf: "2026-06-30",
      }),
    )

    expect(result).toEqual({ status: "ok", message: "uvery.okCreated" })
  })

  it("still drops an orphan as-of date with no zůstatek — nothing to check it against", async () => {
    as(org.members.owner.headers)

    const result = await createLoanAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        institution: "Orphan datum",
        loanKind: "overdraft",
        principal: "10000.00",
        balanceAsOf: "2026-06-30",
      }),
    )

    expect(result).toEqual({ status: "ok", message: "uvery.okCreated" })

    const scope = await requireScope(org.slug)
    const { loans } = await loansForScope(scope)
    const created = loans.find((row) => row.institution === "Orphan datum")
    expect(created).toMatchObject({ balance: null, balanceAsOf: null })
  })

  it("refuses an update that adds a zůstatek with no as-of date, naming the field", async () => {
    as(org.members.owner.headers)

    const created = await createLoanAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        institution: "Refuse na update",
        loanKind: "lease",
        principal: "50000.00",
      }),
    )
    expect(created.status).toBe("ok")

    const scope = await requireScope(org.slug)
    const { loans } = await loansForScope(scope)
    const loan = loans.find((row) => row.institution === "Refuse na update")
    if (!loan) throw new Error("fixture loan not found")

    const result = await updateLoanAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        loanId: loan.id,
        institution: loan.institution,
        loanKind: loan.loanKind,
        principal: loan.principal,
        balance: "12345.00",
      }),
    )

    expect(result).toEqual({
      status: "error",
      error: "uvery.errorBalanceAsOfRequired",
    })
  })

  it("maps a remaining CHECK (interest rate past 100 %) to a Czech sentence, never a crash", async () => {
    as(org.members.owner.headers)

    // `formOptionalRate`'s syntax gate accepts 3 integer digits — "150"
    // reaches the database, where `loan_interest_rate_range` refuses it.
    // `readLoanForm` has no field-level rule for this one, so this is
    // `guarded`'s own fallback, not the named-field path above.
    const result = await createLoanAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        institution: "Urok mimo rozsah",
        loanKind: "loan",
        principal: "1000.00",
        interestRatePct: "150",
      }),
    )

    expect(result).toEqual({ status: "error", error: "uvery.errorRejected" })
  })
})
