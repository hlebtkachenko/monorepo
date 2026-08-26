/**
 * The DPH gate as every Daně a podání page actually calls it — through
 * `resolveVisibleFilingFamilies`, not through `visibleFilingFamiliesForScope`
 * directly (that function's own coverage lives in `lib/data/filings.test.ts`;
 * this suite is about the `cache()` wrapper and the orgSlug-based resolution
 * on top of it).
 */
import { afterAll, describe, expect, it, vi } from "vitest"

import {
  createFilingRow,
  createMonthPeriod,
  endFixtures,
  seedOrganization,
} from "../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { resolveVisibleFilingFamilies } = await import("./dane-scope")

function as(headers: Headers): void {
  request.headers = headers
}

afterAll(async () => {
  await endFixtures()
})

describe("resolveVisibleFilingFamilies — the §2.3 DPH gate, at the door every dane page uses", () => {
  it("branch 1/4 — plátce: DPH visible with no filings at all", async () => {
    const org = await seedOrganization({ vatRegime: "platce" })
    as(org.members.member.headers)

    expect(await resolveVisibleFilingFamilies(org.slug)).toContain("dph")
  })

  it("branch 2/4 — neplátce with DPH history: DPH stays visible", async () => {
    const org = await seedOrganization({ vatRegime: "neplatce" })
    const periodId = await createMonthPeriod(org.organizationId)
    await createFilingRow(org.organizationId, periodId, {
      kind: "dph_priznani",
    })
    as(org.members.guest.headers)

    expect(await resolveVisibleFilingFamilies(org.slug)).toContain("dph")
  })

  it("branch 3/4 — neplátce, clean: DPH hidden, the other three still present", async () => {
    const org = await seedOrganization({ vatRegime: "neplatce" })
    as(org.members.admin.headers)

    const families = await resolveVisibleFilingFamilies(org.slug)
    expect(families).not.toContain("dph")
    expect(families.sort()).toEqual(
      ["dan_z_prijmu", "mzdove_odvody", "ostatni"].sort(),
    )
  })

  it("branch 4/4 — the gate flip: hidden before the first DPH filing, visible after", async () => {
    const org = await seedOrganization({ vatRegime: "neplatce" })
    as(org.members.owner.headers)

    expect(await resolveVisibleFilingFamilies(org.slug)).not.toContain("dph")

    const periodId = await createMonthPeriod(org.organizationId)
    await createFilingRow(org.organizationId, periodId, {
      kind: "dph_kontrolni_hlaseni",
    })

    expect(await resolveVisibleFilingFamilies(org.slug)).toContain("dph")
  })

  it("belongs to one organization only", async () => {
    const org = await seedOrganization({ vatRegime: "neplatce" })
    const foreign = await seedOrganization({ vatRegime: "platce" })
    const foreignPeriodId = await createMonthPeriod(foreign.organizationId)
    await createFilingRow(foreign.organizationId, foreignPeriodId, {
      kind: "dph_priznani",
    })

    as(org.members.admin.headers)
    expect(await resolveVisibleFilingFamilies(org.slug)).not.toContain("dph")
  })
})
