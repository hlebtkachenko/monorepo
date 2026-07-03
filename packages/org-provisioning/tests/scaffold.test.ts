/**
 * Integration test for the scaffolding orchestrator against a real Postgres 18
 * (testcontainer via globalSetup). Seeds a workspace + owner membership, then
 * scaffolds organizations across regimes and asserts the full ready-to-book
 * graph + idempotent replay + statutory guards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { adminClient, truncateAll } from "@workspace/db/tests/fixtures"
import {
  scaffoldOrganization,
  ScaffoldValidationError,
  type ScaffoldInputRaw,
} from "../src/index"

let adminSql: postgres.Sql
let workspaceId: string
let ownerUserId: string

async function seedWorkspaceAndOwner(): Promise<void> {
  const [user] = await adminSql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES ('scaffold-owner@test.invalid', 'Scaffold Owner', 'user')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`
  ownerUserId = user!.id

  const [ws] = await adminSql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id, contact_email)
    VALUES ('Scaffold WS', ${ownerUserId}::uuid, 'scaffold-owner@test.invalid')
    RETURNING id`
  workspaceId = ws!.id

  // Owner workspace_membership — gated by the last-owner-demotion trigger, so
  // run under app_admin like withAdminBypass / the onboarding action.
  await adminSql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE app_admin`)
    await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
    await tx.unsafe(
      `INSERT INTO workspace_membership (workspace_id, user_id, role)
       VALUES ('${workspaceId}'::uuid, '${ownerUserId}'::uuid, 'owner')`,
    )
  })
}

function baseInput(overrides: Partial<ScaffoldInputRaw>): ScaffoldInputRaw {
  return {
    workspaceId,
    ownerUserId,
    idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
    legalName: "Test s.r.o.",
    personKind: "legal_entity",
    legalFormCode: "SRO",
    entityKind: "NEW_ENTITY",
    fiscalYear: 2026,
    ...overrides,
  }
}

beforeAll(async () => {
  adminSql = adminClient()
  await seedWorkspaceAndOwner()
})

afterAll(async () => {
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
})

describe("scaffoldOrganization — double-entry (s.r.o.)", () => {
  it("mints a ready-to-book entity with a seeded chart", async () => {
    const result = await scaffoldOrganization(
      baseInput({
        legalName: "Alfa s.r.o.",
        ico: "12345678",
        dic: "CZ12345678",
        vatRegimeCode: "PAYER",
        inPublicRegister: true,
        registeredAt: "2026-03-15",
        businessActivityCodes: [],
        dataBoxId: "abc1234",
        contactEmail: "info@alfa.cz",
        taxOfficeCode: "007",
        registryFileNumber: "C 12345, Krajský soud v Plzni",
        address: { region: "Plzeňský kraj", houseNumber: "12" },
        authorizedPerson: {
          givenName: "Jan",
          familyName: "Novák",
          position: "jednatel",
        },
        oss: { scheme: "UNION", validFrom: "2026-03-15" },
      }),
    )

    expect(result.regime).toBe("DOUBLE_ENTRY")
    expect(result.chartId).not.toBeNull()
    expect(result.accountsSeeded).toBeGreaterThan(200)
    expect(result.periodId).not.toBe("")
    expect(result.replayed).toBe(false)
    expect(result.nextRequiredTasks).toContain("OPENING_BALANCES")

    const orgId = result.organizationId
    const [org] = await adminSql<
      Array<{ legal_form_code: string; ico: string; slug: string }>
    >`SELECT legal_form_code, ico, slug FROM organization WHERE id = ${orgId}::uuid`
    expect(org!.legal_form_code).toBe("SRO")
    expect(org!.ico).toBe("12345678")

    const [membership] = await adminSql<Array<{ role: string }>>`
      SELECT role FROM organization_membership
      WHERE organization_id = ${orgId}::uuid AND user_id = ${ownerUserId}::uuid`
    expect(membership!.role).toBe("owner")

    const [period] = await adminSql<
      Array<{ period_start: string; period_end: string; regime_code: string }>
    >`SELECT period_start::text, period_end::text, regime_code FROM accounting_period WHERE organization_id = ${orgId}::uuid`
    expect(period!.regime_code).toBe("DOUBLE_ENTRY")
    expect(period!.period_start).toBe("2026-03-15")
    expect(period!.period_end).toBe("2026-12-31")

    // Saldokonto flags: 311 tracked, 518 not.
    const flags = await adminSql<Array<{ number: string; tracks: boolean }>>`
      SELECT number, tracks_open_items AS tracks FROM account
      WHERE organization_id = ${orgId}::uuid AND number IN ('311', '518')`
    const byNumber = new Map(flags.map((r) => [r.number, r.tracks]))
    expect(byNumber.get("311")).toBe(true)
    expect(byNumber.get("518")).toBe(false)

    const [series] = await adminSql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM number_series WHERE organization_id = ${orgId}::uuid`
    expect(series!.n).toBe(8)

    const [self] = await adminSql<Array<{ tax_id: string | null }>>`
      SELECT tax_id FROM counterparty WHERE self_of_organization_id = ${orgId}::uuid`
    expect(self!.tax_id).toBe("CZ12345678")

    const [vat] = await adminSql<
      Array<{ vat_regime_code: string; filing_period: string | null }>
    >`SELECT vat_regime_code, filing_period FROM vat_status WHERE organization_id = ${orgId}::uuid`
    expect(vat!.vat_regime_code).toBe("PAYER")
    expect(vat!.filing_period).toBe("MONTHLY")

    // Extended config (0041): columns + satellites.
    const [cfg] = await adminSql<
      Array<{
        data_box_id: string | null
        tax_office_code: string | null
        registered_region: string | null
        registry_file_number: string | null
      }>
    >`SELECT data_box_id, tax_office_code, registered_region, registry_file_number
      FROM organization WHERE id = ${orgId}::uuid`
    expect(cfg!.data_box_id).toBe("abc1234")
    expect(cfg!.tax_office_code).toBe("007")
    expect(cfg!.registered_region).toBe("Plzeňský kraj")

    const [signer] = await adminSql<
      Array<{ family_name: string; is_primary: boolean }>
    >`SELECT family_name, is_primary FROM organization_authorized_person
      WHERE organization_id = ${orgId}::uuid`
    expect(signer!.family_name).toBe("Novák")
    expect(signer!.is_primary).toBe(true)

    const [oss] = await adminSql<Array<{ scheme: string }>>`
      SELECT scheme FROM organization_oss_registration WHERE organization_id = ${orgId}::uuid`
    expect(oss!.scheme).toBe("UNION")
  })

  it("rejects OSS for a non-payer (§110k ZDPH)", async () => {
    await expect(
      scaffoldOrganization(
        baseInput({
          legalName: "Gamma s.r.o.",
          vatRegimeCode: "NON_PAYER",
          oss: { scheme: "UNION", validFrom: "2026-01-01" },
        }),
      ),
    ).rejects.toMatchObject({ code: "OSS_REQUIRES_VAT_REGISTRATION" })
  })

  it("replays on a repeated idempotency key (no duplicate org)", async () => {
    const key = `idem-fixed-${Math.random().toString(36).slice(2)}`
    const first = await scaffoldOrganization(
      baseInput({ legalName: "Beta s.r.o.", idempotencyKey: key }),
    )
    const second = await scaffoldOrganization(
      baseInput({ legalName: "Beta s.r.o.", idempotencyKey: key }),
    )
    expect(second.replayed).toBe(true)
    expect(second.organizationId).toBe(first.organizationId)

    const [count] = await adminSql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM organization_provisioning
      WHERE workspace_id = ${workspaceId}::uuid AND idempotency_key = ${key}`
    expect(count!.n).toBe(1)
  })
})

describe("scaffoldOrganization — monetary regimes + guards", () => {
  it("scaffolds an OSVČ on daňová evidence with no chart but with categories", async () => {
    const result = await scaffoldOrganization(
      baseInput({
        legalName: "Jan Novák",
        personKind: "natural_person",
        legalFormCode: "OSVC",
        regimeCode: "TAX_RECORDS",
        registeredAt: "2026-02-01",
      }),
    )
    expect(result.regime).toBe("TAX_RECORDS")
    expect(result.chartId).toBeNull()
    expect(result.accountsSeeded).toBe(0)

    const [cats] = await adminSql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM category WHERE organization_id = ${result.organizationId}::uuid`
    expect(cats!.n).toBe(4)
  })

  it("rejects an ambiguous regime (OSVČ, no explicit choice)", async () => {
    await expect(
      scaffoldOrganization(
        baseInput({
          legalName: "Petr OSVČ",
          personKind: "natural_person",
          legalFormCode: "OSVC",
        }),
      ),
    ).rejects.toBeInstanceOf(ScaffoldValidationError)
  })

  it("rejects nonprofit double-entry (504/2002 chart unsupported)", async () => {
    await expect(
      scaffoldOrganization(
        baseInput({
          legalName: "Spolek X",
          legalFormCode: "SPOLEK",
          legalSubjectKind: "non_profit",
          regimeCode: "DOUBLE_ENTRY",
        }),
      ),
    ).rejects.toMatchObject({ code: "NONPROFIT_DOUBLE_ENTRY_UNSUPPORTED" })
  })

  it("rejects a single-entry VAT payer (§1f ZoÚ)", async () => {
    await expect(
      scaffoldOrganization(
        baseInput({
          legalName: "Spolek Y",
          legalFormCode: "SPOLEK",
          legalSubjectKind: "non_profit",
          regimeCode: "SINGLE_ENTRY",
          vatRegimeCode: "PAYER",
          dic: "CZ12345678",
        }),
      ),
    ).rejects.toMatchObject({ code: "SINGLE_ENTRY_VAT_PAYER" })
  })
})
