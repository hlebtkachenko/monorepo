/**
 * Majetek — the asset register and its event history, against a real
 * Postgres 18.
 *
 * WRITES TAKE AN `OwnerScope`, NOT AN `OrgScope` (spec §3.3, `scope.ts`'s
 * `requireOwner` — PR 14). `createAsset` / `updateAsset` / `disposeAsset` /
 * `addAssetEvent` cannot even be CALLED with an admin's, member's or guest's
 * handle — that is a compile error, not a runtime branch — so the authz proof
 * below is the same shape `documents-office.test.ts` uses: obtain the write
 * handle only through `requireOwner`, and show every non-owner role is
 * refused AT THAT DOOR. `requireOwner`'s own exhaustive per-role proof lives
 * in `scope.test.ts`; this file does not re-derive it.
 *
 * Extends the tenancy contract `scope.test.ts` / `filings.test.ts` establish:
 * every org-scoped surface reaches its data through `requireScope`, so the
 * cross-org case here costs a fixture and an assertion, not a fresh suite.
 */
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { betaDb } from "@/db/client"
import { asset } from "@/db/schema"

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
const {
  assetsForScope,
  assetForScope,
  assetEventsForScope,
  createAsset,
  updateAsset,
  disposeAsset,
  addAssetEvent,
} = await import("./assets")
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
 * Assert that a database constraint refused the write, by NAME — mirrors
 * `filings.test.ts`'s helper of the same name.
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

async function orgScopeFor(
  org: TestOrganization,
  role: "owner" | "admin" | "member" | "guest",
) {
  as(org.members[role].headers)
  return requireScope(org.slug)
}

/** The only handle `createAsset` / `updateAsset` / `disposeAsset` / `addAssetEvent` accept. */
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
    await createAsset(owner, {
      name: "Míchačka",
      category: "machine",
      acquisitionCost: "45000.00",
    })

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      const scope = await orgScopeFor(org, role)
      const { assets } = await assetsForScope(scope)
      expect(assets, `${role} reads the register`).toHaveLength(1)
    }
  })

  it("returns only the scope's own assets", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const foreignOwner = await ownerScopeFor(foreign)

    const { id: mine } = await createAsset(owner, {
      name: "Vrtačka",
      category: "tool",
      acquisitionCost: "1200.00",
    })
    await createAsset(foreignOwner, {
      name: "Cizí stroj",
      category: "machine",
      acquisitionCost: "9999.00",
    })

    const scope = await orgScopeFor(org, "admin")
    const { assets } = await assetsForScope(scope)
    expect(assets.map((a) => a.id)).toEqual([mine])
  })

  it("cannot be pointed at another organization — the handle is the only input", async () => {
    const foreignOwner = await ownerScopeFor(orgB)
    await createAsset(foreignOwner, {
      name: "Nákladní vozidlo",
      category: "vehicle",
      acquisitionCost: "800000.00",
    })

    as(orgA.members.member.headers)
    await expect404(
      () => requireScope(orgB.slug),
      "A's member must not resolve B",
    )
  })

  it("assetForScope answers null for another organization's asset, id in hand", async () => {
    const foreignOwner = await ownerScopeFor(orgB)
    const { id: foreignAssetId } = await createAsset(foreignOwner, {
      name: "Cizí nemovitost",
      category: "real_estate",
      acquisitionCost: "5000000.00",
    })

    const scope = await orgScopeFor(orgA, "owner")
    expect(await assetForScope(scope, foreignAssetId)).toBeNull()
    // Same for a syntactically valid but unrelated uuid.
    expect(
      await assetForScope(scope, "00000000-0000-7000-8000-000000000000"),
    ).toBeNull()
    // And for a malformed id — answered without a round trip, never a driver 500.
    expect(await assetForScope(scope, "not-a-uuid")).toBeNull()
  })

  it("assetEventsForScope answers empty for another organization's asset, id in hand", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const foreignOwner = await ownerScopeFor(foreign)

    const { id: foreignAssetId } = await createAsset(foreignOwner, {
      name: "Cizí stroj",
      category: "machine",
      acquisitionCost: "1000.00",
    })
    await addAssetEvent(foreignOwner, foreignAssetId, {
      kind: "put_into_service",
      eventDate: "2026-01-15",
    })

    const scope = await orgScopeFor(org, "owner")
    expect(await assetEventsForScope(scope, foreignAssetId)).toEqual([])
  })

  it("filters by status", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const { id: keep } = await createAsset(owner, {
      name: "V používání",
      category: "tool",
      acquisitionCost: "500.00",
    })
    const { id: disposedId } = await createAsset(owner, {
      name: "Vyřazené",
      category: "tool",
      acquisitionCost: "500.00",
    })
    await disposeAsset(owner, disposedId, "2026-02-01")

    const scope = await orgScopeFor(org, "member")
    expect(
      (await assetsForScope(scope, { status: "in_use" })).assets.map(
        (a) => a.id,
      ),
    ).toEqual([keep])
    expect(
      (await assetsForScope(scope, { status: "disposed" })).assets.map(
        (a) => a.id,
      ),
    ).toEqual([disposedId])
    expect((await assetsForScope(scope)).assets).toHaveLength(2)
  })
})

describe("residualValue — presentation SQL, never stored (spec §0.2)", () => {
  it("is null when the office has not provided oprávky yet", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createAsset(owner, {
      name: "Bez oprávek",
      category: "machine",
      acquisitionCost: "10000.00",
    })

    const scope = await orgScopeFor(org, "guest")
    const [row] = (await assetsForScope(scope)).assets
    expect(row!.residualValue).toBeNull()
    expect(row!.depreciationAsOf).toBeNull()
  })

  it("is acquisition_cost minus accumulated_depreciation, computed in SQL", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createAsset(owner, {
      name: "S oprávkami",
      category: "machine",
      acquisitionCost: "10000.00",
      accumulatedDepreciation: "3500.50",
      depreciationAsOf: "2026-06-30",
    })

    const scope = await orgScopeFor(org, "admin")
    const [row] = (await assetsForScope(scope)).assets
    expect(row!.residualValue).toBe("6499.50")
    expect(row!.depreciationAsOf).toBe("2026-06-30")

    const single = await assetForScope(scope, row!.id)
    expect(single!.residualValue).toBe("6499.50")
  })

  it("footer totals sum only the filtered rows, in SQL", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createAsset(owner, {
      name: "A",
      category: "tool",
      acquisitionCost: "1000.00",
      accumulatedDepreciation: "200.00",
      depreciationAsOf: "2026-01-01",
    })
    const { id: disposedId } = await createAsset(owner, {
      name: "B",
      category: "tool",
      acquisitionCost: "2000.00",
      accumulatedDepreciation: "500.00",
      depreciationAsOf: "2026-01-01",
    })
    await disposeAsset(owner, disposedId, "2026-03-01")

    const scope = await orgScopeFor(org, "owner")
    const all = await assetsForScope(scope)
    expect(all.totals).toEqual({
      acquisitionCost: "3000.00",
      residualValue: "2300.00",
    })

    const inUseOnly = await assetsForScope(scope, { status: "in_use" })
    expect(inUseOnly.totals).toEqual({
      acquisitionCost: "1000.00",
      residualValue: "800.00",
    })
  })

  it("totals zero, not undefined, on an empty book", async () => {
    const org = await seedOrganization()
    const scope = await orgScopeFor(org, "owner")
    expect((await assetsForScope(scope)).totals).toEqual({
      acquisitionCost: "0.00",
      residualValue: "0.00",
    })
  })
})

describe("money round-trip and forbidden columns", () => {
  it("returns money as a string, at full scale, never a JS number", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createAsset(owner, {
      name: "Přesná částka",
      category: "machine",
      acquisitionCost: "123456789012.34",
      taxResidualValue: "-1.50",
    })

    const scope = await orgScopeFor(org, "guest")
    const [row] = (await assetsForScope(scope)).assets
    expect(row!.acquisitionCost).toBe("123456789012.34")
    expect(typeof row!.acquisitionCost).toBe("string")
    expect(row!.taxResidualValue).toBe("-1.50")
  })

  it("returns a projection that carries no office-internal column", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createAsset(owner, {
      name: "S poznámkami",
      category: "other",
      acquisitionCost: "100.00",
      noteClient: "Vidí klient",
      noteInternal: "Neveřejná poznámka kanceláře",
    })

    const scope = await orgScopeFor(org, "guest")
    const [row] = (await assetsForScope(scope)).assets
    expect(row!.noteClient).toBe("Vidí klient")
    expect(forbiddenClientKeys(row)).toEqual([])
    expect(JSON.stringify(row)).not.toContain("Neveřejná")
    expect(row).not.toHaveProperty("organizationId")
  })
})

describe("office writes — owner-only", () => {
  it("creates, edits, disposes and adds an event", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    const { id } = await createAsset(owner, {
      name: "Rypadlo",
      category: "machine",
      acquisitionCost: "1500000.00",
      isMinor: false,
    })

    expect(
      await updateAsset(owner, id, {
        acquisitionCost: "1550000.00",
        siteRef: "Stavba Karlín",
      }),
    ).toBe(true)

    let item = await assetForScope(owner, id)
    expect(item).toMatchObject({
      acquisitionCost: "1550000.00",
      siteRef: "Stavba Karlín",
      status: "in_use",
      disposedOn: null,
    })

    const { id: eventId } = await addAssetEvent(owner, id, {
      kind: "improvement",
      eventDate: "2026-05-01",
      amount: "20000.00",
      note: "Nový motor",
    })
    expect(eventId).toBeTruthy()

    const events = await assetEventsForScope(owner, id)
    expect(events).toMatchObject([
      { kind: "improvement", eventDate: "2026-05-01", amount: "20000.00" },
    ])

    expect(await disposeAsset(owner, id, "2026-08-01")).toBe(true)
    item = await assetForScope(owner, id)
    expect(item).toMatchObject({ status: "disposed", disposedOn: "2026-08-01" })
  })

  it("requireOwner refuses every non-owner role — the only door to these writes", async () => {
    // createAsset / updateAsset / disposeAsset / addAssetEvent take an
    // OwnerScope, so `createAsset(memberScope, ...)` is a TYPE ERROR, not a
    // runtime branch — there is no way to construct that call to test at
    // runtime. What IS reachable at runtime is the door itself.
    for (const role of ["admin", "member", "guest"] as const) {
      const scope = await orgScopeFor(orgA, role)
      await expect404(
        () => requireOwner(scope),
        `${role} must not obtain the Majetek write handle`,
      )
    }
  })

  it("an empty patch is a no-op, not a wipe", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const { id } = await createAsset(owner, {
      name: "Beze změny",
      category: "tool",
      acquisitionCost: "300.00",
    })

    expect(await updateAsset(owner, id, {})).toBe(true)
    const item = await assetForScope(owner, id)
    expect(item!.acquisitionCost).toBe("300.00")
  })

  it("cannot edit or dispose another organization's asset, id in hand", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const foreignOwner = await ownerScopeFor(foreign)
    const { id: foreignAssetId } = await createAsset(foreignOwner, {
      name: "Cizí majetek",
      category: "machine",
      acquisitionCost: "999.00",
    })

    const owner = await ownerScopeFor(org)
    expect(
      await updateAsset(owner, foreignAssetId, { acquisitionCost: "0.00" }),
    ).toBe(false)
    expect(await disposeAsset(owner, foreignAssetId, "2026-01-01")).toBe(false)

    const untouched = await assetForScope(foreignOwner, foreignAssetId)
    expect(untouched!.acquisitionCost).toBe("999.00")
    expect(untouched!.status).toBe("in_use")
  })

  it("refuses an event for another organization's asset — composite FK", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const foreignOwner = await ownerScopeFor(foreign)
    const { id: foreignAssetId } = await createAsset(foreignOwner, {
      name: "Cizí majetek",
      category: "machine",
      acquisitionCost: "999.00",
    })

    const owner = await ownerScopeFor(org)
    await expectConstraintRefusal(
      () =>
        addAssetEvent(owner, foreignAssetId, {
          kind: "put_into_service",
          eventDate: "2026-01-01",
        }),
      /asset_event_asset_fk/,
    )
  })

  describe("dispose transition rules — DB CHECKs", () => {
    it("refuses disposed status with no disposed_on", async () => {
      const org = await seedOrganization()
      const owner = await ownerScopeFor(org)
      const { id } = await createAsset(owner, {
        name: "Test",
        category: "tool",
        acquisitionCost: "1.00",
      })

      // updateAsset cannot even express this (status is not on its patch), so
      // this exercises the CHECK the way a raw UPDATE could still reach it.
      await expectConstraintRefusal(
        () =>
          betaDb()
            .update(asset)
            .set({ status: "disposed" })
            .where(eq(asset.id, id)),
        /asset_dispose_coherence/,
      )
    })

    it("refuses an oprávky figure with no as-of date", async () => {
      const org = await seedOrganization()
      const owner = await ownerScopeFor(org)
      await expectConstraintRefusal(
        () =>
          createAsset(owner, {
            name: "Test",
            category: "tool",
            acquisitionCost: "1.00",
            accumulatedDepreciation: "0.50",
          }),
        /asset_depreciation_stamp_coherence/,
      )
    })

    it("refuses an as-of date with no oprávky figure", async () => {
      const org = await seedOrganization()
      const owner = await ownerScopeFor(org)
      await expectConstraintRefusal(
        () =>
          createAsset(owner, {
            name: "Test",
            category: "tool",
            acquisitionCost: "1.00",
            depreciationAsOf: "2026-01-01",
          }),
        /asset_depreciation_stamp_coherence/,
      )
    })

    it("refuses depreciation fields on a drobný majetek row", async () => {
      const org = await seedOrganization()
      const owner = await ownerScopeFor(org)
      await expectConstraintRefusal(
        () =>
          createAsset(owner, {
            name: "Drobný majetek",
            category: "tool",
            isMinor: true,
            acquisitionCost: "500.00",
            accumulatedDepreciation: "100.00",
            depreciationAsOf: "2026-01-01",
          }),
        /asset_minor_has_no_depreciation/,
      )
    })
  })
})
