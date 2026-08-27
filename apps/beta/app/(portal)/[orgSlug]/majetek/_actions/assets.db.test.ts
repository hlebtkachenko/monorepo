/**
 * Majetek writes' pair-validation and CHECK-fallback boundary (QA sweep
 * regression: an "Oprávky" figure with no "Oprávky k datu" used to crash
 * with an unhandled `asset_depreciation_stamp_coherence` CHECK violation — a
 * raw Next error overlay rather than a form the office could fix).
 *
 * `createAssetAction` / `updateAssetAction` now refuse the stated-value
 * direction of the pair with a NAMED field error before either write ever
 * reaches `lib/data/assets.ts` — see `readAssetForm` in `./assets.ts`. This
 * file proves that refusal for both create and update, that the orphan-date
 * direction is still silently dropped (never refused — it carries no data to
 * lose), and that a CHECK this file's own validation does not pre-empt
 * (`asset_minor_has_no_depreciation`) still comes back as a Czech sentence
 * through `guarded`, never a crash.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}))

const { createAssetAction, updateAssetAction } = await import("./assets")
const { requireScope } = await import("@/lib/data/scope")
const { assetsForScope } = await import("@/lib/data/assets")

const IDLE = { status: "idle" } as const

function as(headers: Headers): void {
  request.headers = headers
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

/** Run a redirecting action and return where it sent the caller. */
async function expectRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    const digest = String((error as { digest?: unknown }).digest ?? "")
    expect(digest.startsWith("NEXT_REDIRECT"), digest).toBe(true)
    return digest
  }
  throw new Error("expected the action to redirect")
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("asset_depreciation_stamp_coherence — refused, never crashed or silently dropped", () => {
  it("refuses a create with oprávky and no as-of date, naming the field", async () => {
    as(org.members.owner.headers)

    const result = await createAssetAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        name: "Refuse na create",
        category: "machine",
        acquisitionCost: "100000.00",
        accumulatedDepreciation: "20000.00",
      }),
    )

    expect(result).toEqual({
      status: "error",
      error: "majetek.errorDepreciationAsOfRequired",
    })
  })

  it("accepts a create with oprávky AND its as-of date", async () => {
    as(org.members.owner.headers)

    await expectRedirect(() =>
      createAssetAction(
        IDLE,
        fd({
          orgSlug: org.slug,
          name: "Accept na create",
          category: "machine",
          acquisitionCost: "100000.00",
          accumulatedDepreciation: "20000.00",
          depreciationAsOf: "2026-06-30",
        }),
      ),
    )

    const scope = await requireScope(org.slug)
    const { assets } = await assetsForScope(scope)
    const created = assets.find((row) => row.name === "Accept na create")
    expect(created).toMatchObject({
      accumulatedDepreciation: "20000.00",
      depreciationAsOf: "2026-06-30",
    })
  })

  it("still drops an orphan as-of date with no oprávky — nothing to check it against", async () => {
    as(org.members.owner.headers)

    await expectRedirect(() =>
      createAssetAction(
        IDLE,
        fd({
          orgSlug: org.slug,
          name: "Orphan datum",
          category: "tool",
          acquisitionCost: "5000.00",
          depreciationAsOf: "2026-06-30",
        }),
      ),
    )

    const scope = await requireScope(org.slug)
    const { assets } = await assetsForScope(scope)
    const created = assets.find((row) => row.name === "Orphan datum")
    expect(created).toMatchObject({
      accumulatedDepreciation: null,
      depreciationAsOf: null,
    })
  })

  it("refuses an update that adds oprávky with no as-of date, naming the field", async () => {
    as(org.members.owner.headers)

    await expectRedirect(() =>
      createAssetAction(
        IDLE,
        fd({
          orgSlug: org.slug,
          name: "Refuse na update",
          category: "vehicle",
          acquisitionCost: "300000.00",
        }),
      ),
    )

    const scope = await requireScope(org.slug)
    const { assets } = await assetsForScope(scope)
    const asset = assets.find((row) => row.name === "Refuse na update")
    if (!asset) throw new Error("fixture asset not found")

    const result = await updateAssetAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        assetId: asset.id,
        name: asset.name,
        category: asset.category,
        acquisitionCost: asset.acquisitionCost,
        accumulatedDepreciation: "50000.00",
      }),
    )

    expect(result).toEqual({
      status: "error",
      error: "majetek.errorDepreciationAsOfRequired",
    })
  })

  it("maps a remaining CHECK (drobný majetek carrying oprávky) to a Czech sentence, never a crash", async () => {
    as(org.members.owner.headers)

    // `readAssetForm` only validates the stamp pair — it says nothing about
    // `asset_minor_has_no_depreciation`, so a coherent pair on a minor asset
    // still reaches the database and is this test's `guarded` fallback, not
    // the named-field path above.
    const result = await createAssetAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        name: "Drobny s opravkami",
        category: "tool",
        acquisitionCost: "1000.00",
        isMinor: "on",
        accumulatedDepreciation: "100.00",
        depreciationAsOf: "2026-06-30",
      }),
    )

    expect(result).toEqual({ status: "error", error: "majetek.errorRejected" })
  })
})
