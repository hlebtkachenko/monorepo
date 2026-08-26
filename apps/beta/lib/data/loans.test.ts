/**
 * Úvěry a leasingy — the loan register, against a real Postgres 18.
 *
 * WRITES TAKE AN `OwnerScope`, NOT AN `OrgScope` (spec §3.3, `scope.ts`'s
 * `requireOwner` — PR 14). `createLoan` / `updateLoan` cannot even be CALLED
 * with an admin's, member's or guest's handle — that is a compile error, not a
 * runtime branch — so the authz proof below is the same shape
 * `assets.test.ts` uses: obtain the write handle only through `requireOwner`,
 * and show every non-owner role is refused AT THAT DOOR. `requireOwner`'s own
 * exhaustive per-role proof lives in `scope.test.ts`; this file does not
 * re-derive it.
 *
 * The DB CHECKs get their own describe block: the two both-or-neither pairs
 * (`loan_balance_stamp_coherence`, `loan_installment_coherence`) and the rate
 * range are the invariants that keep an undateable zůstatek and an unreadable
 * splátka out of the book, and with no RLS behind this seam they are the floor.
 */
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { betaDb } from "@/db/client"
import { loan } from "@/db/schema"

import {
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope, requireOwner } = await import("./scope")
const { loansForScope, createLoan, updateLoan } = await import("./loans")
const { forbiddenClientKeys } = await import("./projections")

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

async function expect404(
  run: () => Promise<unknown> | unknown,
  because: string,
): Promise<void> {
  let digest: unknown = "<no throw>"
  try {
    await run()
  } catch (error) {
    digest = (error as { digest?: unknown }).digest ?? error
  }
  expect(digest, because).toBe(NOT_FOUND_DIGEST)
}

/** Assert that a database constraint refused the write, by NAME. */
async function expectConstraintRefusal(
  run: () => Promise<unknown>,
  constraint: RegExp,
): Promise<void> {
  let messages = "<no throw>"
  try {
    await run()
  } catch (error) {
    const chain: string[] = []
    let current: unknown = error
    for (let depth = 0; current && depth < 5; depth++) {
      chain.push(String((current as { message?: unknown }).message ?? current))
      current = (current as { cause?: unknown }).cause
    }
    messages = chain.join("\n")
  }
  expect(messages).toMatch(constraint)
}

function as(headers: Headers): void {
  request.headers = headers
}

async function orgScopeFor(
  org: TestOrganization,
  role: "owner" | "admin" | "member" | "guest",
) {
  as(org.members[role].headers)
  return requireScope(org.slug)
}

/** The only handle `createLoan` / `updateLoan` accept. */
async function ownerScopeFor(org: TestOrganization) {
  return requireOwner(await orgScopeFor(org, "owner"))
}

let orgA: TestOrganization
let orgB: TestOrganization

beforeAll(async () => {
  ;[orgA, orgB] = await Promise.all([seedOrganization(), seedOrganization()])
})

afterAll(async () => {
  await endFixtures()
})

describe("reads — every role", () => {
  it("is readable by every role, guest included", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createLoan(owner, {
      institution: "Česká spořitelna",
      loanKind: "loan",
      principal: "1200000.00",
    })

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      const scope = await orgScopeFor(org, role)
      const { loans } = await loansForScope(scope)
      expect(loans, `${role} reads the register`).toHaveLength(1)
    }
  })

  it("returns only the scope's own loans", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const foreignOwner = await ownerScopeFor(foreign)

    const { id: mine } = await createLoan(owner, {
      institution: "Moneta",
      loanKind: "lease",
      principal: "480000.00",
    })
    await createLoan(foreignOwner, {
      institution: "Cizí banka",
      loanKind: "loan",
      principal: "999999.00",
    })

    const scope = await orgScopeFor(org, "admin")
    const { loans } = await loansForScope(scope)
    expect(loans.map((l) => l.id)).toEqual([mine])
  })

  it("cannot be pointed at another organization — the handle is the only input", async () => {
    const foreignOwner = await ownerScopeFor(orgB)
    await createLoan(foreignOwner, {
      institution: "Cizí leasing",
      loanKind: "lease",
      principal: "300000.00",
    })

    as(orgA.members.member.headers)
    await expect404(
      () => requireScope(orgB.slug),
      "A's member must not resolve B",
    )
  })

  // ASCII-only institution names on purpose: the ordering under test is the
  // `ORDER BY institution` clause, not the container's collation for Č.
  it("orders alphabetically by instituce", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createLoan(owner, {
      institution: "Raiffeisenbank",
      loanKind: "loan",
      principal: "1.00",
    })
    await createLoan(owner, {
      institution: "Komercni banka",
      loanKind: "overdraft",
      principal: "2.00",
    })

    const scope = await orgScopeFor(org, "guest")
    const { loans } = await loansForScope(scope)
    expect(loans.map((l) => l.institution)).toEqual([
      "Komercni banka",
      "Raiffeisenbank",
    ])
  })
})

describe("totals — SQL only, and honest about what they cover", () => {
  it("sums jistina over every row and counts the stated zůstatky", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createLoan(owner, {
      institution: "A banka",
      loanKind: "loan",
      principal: "1000.00",
      balance: "800.00",
      balanceAsOf: "2026-06-30",
    })
    await createLoan(owner, {
      institution: "B banka",
      loanKind: "loan",
      principal: "2000.00",
      balance: "1500.50",
      balanceAsOf: "2026-06-30",
    })

    const scope = await orgScopeFor(org, "member")
    const { totals } = await loansForScope(scope)
    expect(totals).toEqual({
      principal: "3000.00",
      balance: "2300.50",
      balanceStatedCount: 2,
      loanCount: 2,
    })
  })

  it("reports a partial zůstatek total as partial, never as the whole book", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createLoan(owner, {
      institution: "A banka",
      loanKind: "loan",
      principal: "1000.00",
      balance: "800.00",
      balanceAsOf: "2026-06-30",
    })
    await createLoan(owner, {
      institution: "B banka",
      loanKind: "overdraft",
      principal: "2000.00",
    })

    const scope = await orgScopeFor(org, "guest")
    const { totals } = await loansForScope(scope)
    expect(totals.balanceStatedCount).toBe(1)
    expect(totals.loanCount).toBe(2)
    // The sum itself is still only over the stated one — which is exactly why
    // the page refuses to print it unless the two counts agree.
    expect(totals.balance).toBe("800.00")
  })

  it("totals zero, not undefined, on an empty book", async () => {
    const org = await seedOrganization()
    const scope = await orgScopeFor(org, "owner")
    expect((await loansForScope(scope)).totals).toEqual({
      principal: "0.00",
      balance: null,
      balanceStatedCount: 0,
      loanCount: 0,
    })
  })
})

describe("money round-trip and forbidden columns", () => {
  it("returns money as a string, at full scale, never a JS number", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createLoan(owner, {
      institution: "Přesná banka",
      loanKind: "loan",
      principal: "123456789012.34",
      balance: "0.01",
      balanceAsOf: "2026-01-31",
      installment: "12345.67",
      installmentPeriod: "quarterly",
      interestRatePct: "4.125",
    })

    const scope = await orgScopeFor(org, "guest")
    const [row] = (await loansForScope(scope)).loans
    expect(row!.principal).toBe("123456789012.34")
    expect(typeof row!.principal).toBe("string")
    expect(row!.balance).toBe("0.01")
    expect(row!.installment).toBe("12345.67")
    // A percent, kept at numeric(6,3): 4,125 % survives verbatim.
    expect(row!.interestRatePct).toBe("4.125")
  })

  it("returns a projection that carries no office-internal column", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createLoan(owner, {
      institution: "S poznámkami",
      loanKind: "lease",
      principal: "100.00",
      noteClient: "Vidí klient",
      noteInternal: "Neveřejná poznámka kanceláře",
    })

    const scope = await orgScopeFor(org, "guest")
    const [row] = (await loansForScope(scope)).loans
    expect(row!.noteClient).toBe("Vidí klient")
    expect(forbiddenClientKeys(row)).toEqual([])
    expect(JSON.stringify(row)).not.toContain("Neveřejná")
    expect(row).not.toHaveProperty("organizationId")
  })
})

describe("office writes — owner-only", () => {
  it("creates and edits", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    const { id } = await createLoan(owner, {
      institution: "Komerční banka",
      loanKind: "loan",
      principal: "2500000.00",
      installment: "18500.00",
      installmentPeriod: "monthly",
      interestRatePct: "5.900",
      endsOn: "2032-12-31",
    })

    expect(
      await updateLoan(owner, id, {
        balance: "2100000.00",
        balanceAsOf: "2026-06-30",
      }),
    ).toBe(true)

    const scope = await orgScopeFor(org, "owner")
    const [row] = (await loansForScope(scope)).loans
    expect(row).toMatchObject({
      institution: "Komerční banka",
      loanKind: "loan",
      principal: "2500000.00",
      balance: "2100000.00",
      balanceAsOf: "2026-06-30",
      installment: "18500.00",
      installmentPeriod: "monthly",
      endsOn: "2032-12-31",
    })
  })

  it("requireOwner refuses every non-owner role — the only door to these writes", async () => {
    // createLoan / updateLoan take an OwnerScope, so `createLoan(memberScope,
    // ...)` is a TYPE ERROR, not a runtime branch — there is no way to
    // construct that call to test at runtime. What IS reachable at runtime is
    // the door itself.
    for (const role of ["admin", "member", "guest"] as const) {
      const scope = await orgScopeFor(orgA, role)
      await expect404(
        () => requireOwner(scope),
        `${role} must not obtain the Úvěry write handle`,
      )
    }
  })

  it("an empty patch is a no-op, not a wipe", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const { id } = await createLoan(owner, {
      institution: "Beze změny",
      loanKind: "loan",
      principal: "300.00",
    })

    expect(await updateLoan(owner, id, {})).toBe(true)
    const [row] = (await loansForScope(owner)).loans
    expect(row!.id).toBe(id)
    expect(row!.principal).toBe("300.00")
  })

  it("cannot edit another organization's loan, id in hand", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const foreignOwner = await ownerScopeFor(foreign)
    const { id: foreignLoanId } = await createLoan(foreignOwner, {
      institution: "Cizí banka",
      loanKind: "loan",
      principal: "999.00",
    })

    const owner = await ownerScopeFor(org)
    expect(await updateLoan(owner, foreignLoanId, { principal: "0.00" })).toBe(
      false,
    )

    const [untouched] = (await loansForScope(foreignOwner)).loans
    expect(untouched!.principal).toBe("999.00")
  })
})

describe("DB invariants — the floor under the seam", () => {
  it("refuses a zůstatek with no as-of date", async () => {
    const owner = await ownerScopeFor(await seedOrganization())
    await expectConstraintRefusal(
      () =>
        createLoan(owner, {
          institution: "Test",
          loanKind: "loan",
          principal: "1.00",
          balance: "0.50",
        }),
      /loan_balance_stamp_coherence/,
    )
  })

  it("refuses an as-of date with no zůstatek", async () => {
    const owner = await ownerScopeFor(await seedOrganization())
    await expectConstraintRefusal(
      () =>
        createLoan(owner, {
          institution: "Test",
          loanKind: "loan",
          principal: "1.00",
          balanceAsOf: "2026-01-01",
        }),
      /loan_balance_stamp_coherence/,
    )
  })

  it("refuses a splátka with no frekvence, and a frekvence with no splátka", async () => {
    const owner = await ownerScopeFor(await seedOrganization())
    await expectConstraintRefusal(
      () =>
        createLoan(owner, {
          institution: "Test",
          loanKind: "lease",
          principal: "1.00",
          installment: "10.00",
        }),
      /loan_installment_coherence/,
    )
    await expectConstraintRefusal(
      () =>
        createLoan(owner, {
          institution: "Test",
          loanKind: "lease",
          principal: "1.00",
          installmentPeriod: "monthly",
        }),
      /loan_installment_coherence/,
    )
  })

  it("refuses a blank instituce", async () => {
    const owner = await ownerScopeFor(await seedOrganization())
    await expectConstraintRefusal(
      () =>
        createLoan(owner, {
          institution: "   ",
          loanKind: "loan",
          principal: "1.00",
        }),
      /loan_institution_present/,
    )
  })

  it("refuses a negative jistina and a negative zůstatek", async () => {
    const owner = await ownerScopeFor(await seedOrganization())
    await expectConstraintRefusal(
      () =>
        createLoan(owner, {
          institution: "Test",
          loanKind: "loan",
          principal: "-1.00",
        }),
      /loan_principal_nonnegative/,
    )
    await expectConstraintRefusal(
      () =>
        createLoan(owner, {
          institution: "Test",
          loanKind: "loan",
          principal: "1.00",
          balance: "-0.01",
          balanceAsOf: "2026-01-01",
        }),
      /loan_balance_nonnegative/,
    )
  })

  it("refuses a zero splátka", async () => {
    const owner = await ownerScopeFor(await seedOrganization())
    await expectConstraintRefusal(
      () =>
        createLoan(owner, {
          institution: "Test",
          loanKind: "loan",
          principal: "1.00",
          installment: "0.00",
          installmentPeriod: "monthly",
        }),
      /loan_installment_positive/,
    )
  })

  it("refuses an interest rate outside 0-100 — a percent, never a fraction", async () => {
    const owner = await ownerScopeFor(await seedOrganization())
    await expectConstraintRefusal(
      () =>
        createLoan(owner, {
          institution: "Test",
          loanKind: "loan",
          principal: "1.00",
          interestRatePct: "150.000",
        }),
      /loan_interest_rate_range/,
    )
  })

  it("freezes organization_id — a loan never changes books", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const { id } = await createLoan(owner, {
      institution: "Nepřenositelná",
      loanKind: "loan",
      principal: "10.00",
    })

    await expectConstraintRefusal(
      () =>
        betaDb()
          .update(loan)
          .set({ organization_id: foreign.organizationId })
          .where(eq(loan.id, id)),
      /organization_id/,
    )
  })

  it("touches updated_at on every edit", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const { id } = await createLoan(owner, {
      institution: "Stamp",
      loanKind: "loan",
      principal: "10.00",
    })

    const before = (await loansForScope(owner)).loans[0]!.updatedAt
    await new Promise((resolve) => setTimeout(resolve, 5))
    await updateLoan(owner, id, { principal: "11.00" })
    const after = (await loansForScope(owner)).loans[0]!.updatedAt

    expect(new Date(after).getTime()).toBeGreaterThan(
      new Date(before).getTime(),
    )
  })
})
