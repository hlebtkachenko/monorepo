/**
 * The manual liability residue through the seam (spec §2.4, §3.3).
 *
 * Extends the contract `scope.test.ts` establishes and `filings.test.ts`
 * follows: every org-scoped surface reaches its data through `requireScope`, so
 * a new module's cross-org case costs a fixture and an `expect404` rather than a
 * fresh suite. The sessions are genuine Better Auth sessions; only
 * `next/headers` is mocked, because there is no HTTP request in a test runner.
 *
 * THE AUTHZ MATRIX IS THE POINT OF THIS FILE. Spec §3.3 makes Zadávání dat the
 * ONLY editing home for non-document data and every client page read-only, so
 * every write has to refuse admin, member AND guest — separately, because a
 * matrix with a hole in it is invisible until someone finds the hole.
 *
 * The writes take an `OwnerScope` (PR 14's brand), so the refusal happens where
 * the handle is MINTED rather than inside each function: `requireOwner` 404s
 * every non-owner, and a scope that is not an owner's cannot be widened into a
 * call these functions accept — there is no `OwnerScope` for it to be. The
 * matrix below therefore proves two things at once: no non-owner obtains the
 * handle at runtime, and (by the `@ts-expect-error` case) none can be forged
 * past the compiler either.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createLiabilityRow,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope, requireOwner } = await import("./scope")
const {
  liabilitiesForScope,
  createLiability,
  updateLiability,
  deleteLiabilities,
} = await import("./liabilities")
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

/**
 * Drizzle wraps the driver error and puts the real one on `cause`, so the
 * constraint name is never on the top-level message — same walk
 * `lib/pg-error.ts` does in production, and the same helper `filings.test.ts`
 * uses.
 */
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

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("liabilitiesForScope — a scoped read", () => {
  it("returns only the scope's own liabilities", async () => {
    const target = await seedOrganization()
    const foreign = await seedOrganization()
    await createLiabilityRow(target.organizationId, { label: "Nase" })
    await createLiabilityRow(foreign.organizationId, {
      label: "Cizi",
      amount: "999999.00",
    })

    as(target.members.admin.headers)
    const rows = await liabilitiesForScope(await requireScope(target.slug))

    expect(rows.map((r) => r.label)).toEqual(["Nase"])
    expect(JSON.stringify(rows)).not.toContain("999999")
  })

  it("is readable by every role — Dluhy a platby is client-visible", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId)

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(target.members[role].headers)
      const rows = await liabilitiesForScope(await requireScope(target.slug))
      expect(rows, `${role} reads liabilities`).toHaveLength(1)
    }
  })

  it("hides paid rows by default and returns them on request", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, { label: "Otevreny" })
    await createLiabilityRow(target.organizationId, {
      label: "Zaplaceny",
      paidAt: new Date("2026-02-01T08:00:00Z"),
    })

    as(target.members.owner.headers)
    const scope = await requireScope(target.slug)

    expect((await liabilitiesForScope(scope)).map((r) => r.label)).toEqual([
      "Otevreny",
    ])
    const all = await liabilitiesForScope(scope, { includePaid: true })
    expect(all.map((r) => r.label).sort()).toEqual(["Otevreny", "Zaplaceny"])
    expect(all.find((r) => r.label === "Zaplaceny")!.paidAt).toBe(
      "2026-02-01T08:00:00.000Z",
    )
  })

  it("orders by deadline, soonest first", async () => {
    const target = await seedOrganization()
    for (const dueOn of ["2026-09-30", "2026-03-31", "2026-06-30"]) {
      await createLiabilityRow(target.organizationId, { dueOn })
    }

    as(target.members.admin.headers)
    const rows = await liabilitiesForScope(await requireScope(target.slug))
    expect(rows.map((r) => r.dueOn)).toEqual([
      "2026-03-31",
      "2026-06-30",
      "2026-09-30",
    ])
  })

  it("derives Po splatnosti against today, and never for a paid row", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, {
      label: "Po splatnosti",
      dueInDays: -7,
    })
    await createLiabilityRow(target.organizationId, {
      label: "Zaplaceno pozde",
      dueInDays: -30,
      paidAt: new Date(),
    })
    await createLiabilityRow(target.organizationId, {
      label: "Jeste ne",
      dueInDays: 14,
    })

    as(target.members.admin.headers)
    const rows = await liabilitiesForScope(await requireScope(target.slug), {
      includePaid: true,
    })
    expect(rows.map((r) => [r.label, r.overdue] as const).sort()).toEqual(
      [
        ["Jeste ne", false],
        // Closed rows are never overdue, however late the payment was.
        ["Zaplaceno pozde", false],
        ["Po splatnosti", true],
      ].sort(),
    )
  })

  it("returns money as a string, at full scale", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, { amount: "12345678.91" })

    as(target.members.admin.headers)
    const [row] = await liabilitiesForScope(await requireScope(target.slug))
    expect(row!.amount).toBe("12345678.91")
    expect(typeof row!.amount).toBe("string")
  })

  it("returns a projection that carries no office-internal column", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, {
      noteClient: "Klientska poznamka",
      noteInternal: "Interni poznamka",
    })

    as(target.members.admin.headers)
    const [row] = await liabilitiesForScope(await requireScope(target.slug))

    expect(row!.noteClient).toBe("Klientska poznamka")
    expect(forbiddenClientKeys(row)).toEqual([])
    expect(JSON.stringify(row)).not.toContain("Interni")
    expect(Object.keys(row!).sort()).toEqual([
      "amount",
      "dueOn",
      "group",
      "id",
      "label",
      "noteClient",
      "overdue",
      "paidAt",
      "updatedAt",
      "variableSymbol",
    ])
  })
})

describe("office writes — the §3.3 authz matrix", () => {
  it("creates, edits, marks paid and deletes as owner", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const scope = await requireScope(target.slug)
    const owner = requireOwner(scope)

    const { id } = await createLiability(owner, {
      group: "fu",
      label: "Penale z prodleni",
      amount: "1500.50",
      dueOn: "2026-04-30",
      variableSymbol: "87654321",
      noteInternal: "Interni poznamka",
    })

    const [created] = await liabilitiesForScope(scope)
    expect(created).toMatchObject({
      id,
      group: "fu",
      label: "Penale z prodleni",
      amount: "1500.50",
      dueOn: "2026-04-30",
      variableSymbol: "87654321",
      paidAt: null,
    })
    expect(forbiddenClientKeys(created)).toEqual([])
    expect(JSON.stringify(created)).not.toContain("Interni")

    expect(
      await updateLiability(owner, id, {
        label: "Urok z prodleni",
        amount: "1600.00",
      }),
    ).toBe(true)
    const [edited] = await liabilitiesForScope(scope)
    expect(edited!.label).toBe("Urok z prodleni")
    expect(edited!.amount).toBe("1600.00")

    // Mark paid — the row leaves the open list and the obligations union.
    expect(
      await updateLiability(owner, id, {
        paidAt: new Date("2026-05-02T07:30:00Z"),
      }),
    ).toBe(true)
    expect(await liabilitiesForScope(scope)).toEqual([])
    const [paid] = await liabilitiesForScope(scope, { includePaid: true })
    expect(paid!.paidAt).toBe("2026-05-02T07:30:00.000Z")

    // ...and back, because an explicit null is "mark this unpaid again".
    expect(await updateLiability(owner, id, { paidAt: null })).toBe(true)
    expect(await liabilitiesForScope(scope)).toHaveLength(1)

    expect(await deleteLiabilities(owner, [id])).toBe(1)
    expect(await liabilitiesForScope(scope, { includePaid: true })).toEqual([])
  })

  it("404s every role but owner, before any write is reachable", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const owner = requireOwner(await requireScope(target.slug))
    const { id } = await createLiability(owner, {
      label: "Zbytkovy zavazek",
      amount: "1000.00",
      dueOn: "2026-06-30",
    })

    for (const role of ["admin", "member", "guest"] as const) {
      as(target.members[role].headers)
      const scope = await requireScope(target.slug)

      // The gate is the HANDLE, not a check inside each function: create, edit,
      // mark-paid and delete all demand an `OwnerScope`, and this is the only
      // door that mints one. A hole in the matrix would have to be a fourth
      // write that took a bare `OrgScope`, which is a compile error to write.
      await expect404(
        () => requireOwner(scope),
        `${role} may not mint the write handle`,
      )
    }

    // Nothing above changed anything.
    as(target.members.owner.headers)
    const [survivor] = await liabilitiesForScope(
      await requireScope(target.slug),
    )
    expect(survivor).toMatchObject({ id, amount: "1000.00", paidAt: null })
  })

  it("cannot be handed a non-owner's scope at all — checked by tsc", async () => {
    const target = await seedOrganization()
    as(target.members.guest.headers)
    const guestScope = await requireScope(target.slug)

    // @ts-expect-error An `OrgScope` is not an `OwnerScope`: the owner brand is
    // module-private to `scope.ts`, so this call cannot type-check. The
    // assertion is that the line IS an error — if it ever stops being one,
    // `pnpm --filter beta typecheck` fails on the unused directive.
    await deleteLiabilities(guestScope, [])
  })

  it("cannot edit or delete another organization's liability, id in hand", async () => {
    const foreign = await seedOrganization()
    const foreignId = await createLiabilityRow(foreign.organizationId, {
      label: "Cizi zavazek",
    })

    as(org.members.owner.headers)
    const owner = requireOwner(await requireScope(org.slug))

    // The WHERE clause carries organization_id, so a leaked id matches nothing
    // rather than reaching across the wall — an OwnerScope proves owner-ness in
    // ONE book, never everywhere.
    expect(await updateLiability(owner, foreignId, { amount: "1.00" })).toBe(
      false,
    )
    expect(await deleteLiabilities(owner, [foreignId])).toBe(0)

    as(foreign.members.owner.headers)
    const [untouched] = await liabilitiesForScope(
      await requireScope(foreign.slug),
    )
    expect(untouched).toMatchObject({ label: "Cizi zavazek" })
  })

  it("cannot be pointed at another organization — the handle is the only input", async () => {
    const foreign = await seedOrganization()
    await createLiabilityRow(foreign.organizationId)

    as(org.members.guest.headers)
    // A guest of `org` naming another slug gets a 404 from the seam itself:
    // there is no argument on any liability function that could say "that book".
    await expect404(
      () => requireScope(foreign.slug),
      "a guest of another org resolves no scope here",
    )
  })

  it("lets the database refuse a supplier payable, however the write arrives", async () => {
    as(org.members.owner.headers)
    const owner = requireOwner(await requireScope(org.slug))

    // `dodavatele` belongs wholly to PR 28's imported saldokonto. The type
    // system does not stop it (it is a legal enum value elsewhere), so the DB
    // CHECK is the fence — see migration 0006.
    await expectConstraintRefusal(
      () =>
        createLiability(owner, {
          group: "dodavatele",
          label: "Faktura od dodavatele",
          amount: "5000.00",
          dueOn: "2026-08-31",
        }),
      /liability_group_is_residue/,
    )
  })

  it("refuses a non-positive amount and a blank titul at the boundary", async () => {
    as(org.members.owner.headers)
    const owner = requireOwner(await requireScope(org.slug))

    await expectConstraintRefusal(
      () =>
        createLiability(owner, {
          label: "Zaporny",
          amount: "-1.00",
          dueOn: "2026-08-31",
        }),
      /liability_amount_positive/,
    )

    await expectConstraintRefusal(
      () =>
        createLiability(owner, {
          label: "   ",
          amount: "1.00",
          dueOn: "2026-08-31",
        }),
      /liability_label_present/,
    )
  })

  it("reports a miss rather than a successful save of nothing", async () => {
    as(org.members.owner.headers)
    const owner = requireOwner(await requireScope(org.slug))

    expect(
      await updateLiability(owner, "00000000-0000-7000-8000-000000000000", {
        amount: "1.00",
      }),
    ).toBe(false)
    expect(await deleteLiabilities(owner, [])).toBe(0)
  })
})
