import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { withOrganization } from "@workspace/db"
import {
  assessPeriodCloseReadiness,
  captureDocument,
  closePeriod,
  createAccount,
  createEvent,
  createNumberSeries,
  createPeriod,
  PeriodCloseBlockedError,
  postDoubleEntry,
  type PeriodCloseCheckCode,
} from "../src/index"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
  type DoubleEntrySeed,
} from "./fixtures"

let admin: ReturnType<typeof adminClient>
let workspaceId: string
let organizationId: string
let userId: string
let organizationBId: string
let userBId: string

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  workspaceId = seed.workspaceId
  organizationId = seed.orgAId
  userId = seed.userAId
  organizationBId = seed.orgBId
  userBId = seed.userBId
})

afterAll(async () => {
  await admin.end({ timeout: 5 })
})

function blocker(
  readiness: Awaited<ReturnType<typeof assessPeriodCloseReadiness>>,
  code: PeriodCloseCheckCode,
) {
  return readiness.checks.find((check) => check.code === code)
}

async function assess(seed: DoubleEntrySeed) {
  return await withOrganization(organizationId, userId, (db) =>
    assessPeriodCloseReadiness(db, seed.ctx, seed.periodId),
  )
}

async function postInternal(
  seed: DoubleEntrySeed,
  date: string,
  debitAccountId = seed.accounts["221"]!,
): Promise<{ postingId: string }> {
  return await withOrganization(organizationId, userId, async (db) => {
    const event = await createEvent(db, seed.ctx, {
      periodId: seed.periodId,
      seriesId: seed.eventSeriesId,
      description: "Readiness fixture",
      occurredAt: date,
      responsibleUserId: userId,
    })
    const document = await captureDocument(db, seed.ctx, {
      periodId: seed.periodId,
      seriesId: seed.documentSeriesId,
      type: "INTERNAL",
      issuedAt: date,
      lines: [],
    })
    return await postDoubleEntry(db, seed.ctx, {
      periodId: seed.periodId,
      summaryRecordId: document.summaryRecordId,
      accountingEventId: event.eventId,
      postingDate: date,
      responsibleUserId: userId,
      lines: [
        {
          accountId: debitAccountId,
          side: "DEBIT",
          amount: "100.00",
        },
        {
          accountId: seed.accounts["321"]!,
          side: "CREDIT",
          amount: "100.00",
        },
      ],
    })
  })
}

let supportingSeriesSeq = 0

/**
 * A fully isolated DOUBLE_ENTRY org for the completeness scenarios. Assets and
 * inventory counts persist across tests and a depreciable asset with no plan is
 * legitimately in scope for every later period, so each scenario runs against its
 * own fresh organization rather than the shared orgA. A single-DOCUMENT-series org
 * also keeps closePeriod's series resolution aligned with the seeded postings.
 */
async function freshDoubleEntrySeed(opts: {
  periodStart: string
  periodEnd: string
}): Promise<DoubleEntrySeed> {
  supportingSeriesSeq += 1
  const slug = `close-completeness-${Date.now()}-${supportingSeriesSeq}`
  const [organization] = await admin<Array<{ id: string }>>`
    INSERT INTO organization
      (organization_id, workspace_id, slug, legal_name, person_kind, legal_subject_kind)
    VALUES
      (uuidv7(), ${workspaceId}::uuid, ${slug}, 'Completeness Fixture Organization',
       'legal_entity', 'for_profit')
    RETURNING id
  `
  if (!organization) throw new Error("completeness organization seed failed")
  await admin`
    UPDATE organization SET organization_id = id WHERE id = ${organization.id}::uuid
  `
  return await seedDoubleEntryOrg(organization.id, workspaceId, userId, opts)
}

/** An ASSET Označení series for the seed's organization. */
async function createAssetSeries(seed: DoubleEntrySeed): Promise<string> {
  supportingSeriesSeq += 1
  return await withOrganization(seed.ctx.organizationId, seed.userId, (db) =>
    createNumberSeries(db, seed.ctx, {
      entityType: "ASSET",
      code: `AS${supportingSeriesSeq}`,
      pattern: "DHM{NNNN}",
    }),
  )
}

/** An INVENTORY_COUNT Označení series for the seed's organization. */
async function createInventorySeries(seed: DoubleEntrySeed): Promise<string> {
  supportingSeriesSeq += 1
  return await withOrganization(seed.ctx.organizationId, seed.userId, (db) =>
    createNumberSeries(db, seed.ctx, {
      entityType: "INVENTORY_COUNT",
      code: `IN${supportingSeriesSeq}`,
      pattern: "INV{NNNN}",
    }),
  )
}

/** Seed a register asset directly; optionally give it an active depreciation plan. */
async function insertAsset(
  seed: DoubleEntrySeed,
  seriesId: string,
  opts: {
    category: "INTANGIBLE" | "TANGIBLE_DEPRECIABLE" | "TANGIBLE_NON_DEPRECIABLE"
    designation: string
    commissioningDate: string
    disposalDate?: string
    withPlan?: boolean
  },
): Promise<string> {
  const orgId = seed.ctx.organizationId
  const [asset] = await admin<Array<{ id: string }>>`
    INSERT INTO asset (
      organization_id, number_series_id, sequence_number, designation, name,
      category, account_number, commissioning_date, disposal_date, disposal_method,
      acquisition_cost
    )
    VALUES (
      ${orgId}::uuid, ${seriesId}::uuid, 1, ${opts.designation},
      'Fixture asset', ${opts.category}::asset_category, '022',
      ${opts.commissioningDate}::date, ${opts.disposalDate ?? null}::date,
      ${opts.disposalDate ? "SALE" : null}::asset_disposal_method, '120000.0000'
    )
    RETURNING id
  `
  if (!asset) throw new Error("asset fixture insert failed")
  if (opts.withPlan) {
    await admin`
      INSERT INTO depreciation_plan (
        organization_id, asset_id, method, start_date, useful_life_months,
        monthly_amount, expense_account_number, accumulated_account_number, status
      )
      VALUES (
        ${orgId}::uuid, ${asset.id}::uuid, 'STRAIGHT_LINE',
        ${opts.commissioningDate}::date, 60, '2000.0000', '551', '082', 'ACTIVE'
      )
    `
  }
  return asset.id
}

/** Seed an inventory count with one line of the requested difference kind. */
async function insertInventoryCount(
  seed: DoubleEntrySeed,
  seriesId: string,
  opts: {
    designation: string
    countDate: string
    difference: "MATCH" | "SHORTAGE" | "SURPLUS"
  },
): Promise<string> {
  const orgId = seed.ctx.organizationId
  const [count] = await admin<Array<{ id: string }>>`
    INSERT INTO inventory_count (
      organization_id, number_series_id, sequence_number, designation, count_date
    )
    VALUES (
      ${orgId}::uuid, ${seriesId}::uuid, 1, ${opts.designation},
      ${opts.countDate}::date
    )
    RETURNING id
  `
  if (!count) throw new Error("inventory count fixture insert failed")
  const actualValue =
    opts.difference === "MATCH"
      ? "1000.0000"
      : opts.difference === "SHORTAGE"
        ? "600.0000"
        : "1400.0000"
  await admin`
    INSERT INTO inventory_count_line (
      organization_id, inventory_count_id, description, book_value, actual_value,
      difference_kind
    )
    VALUES (
      ${orgId}::uuid, ${count.id}::uuid, 'Fixture line', '1000.0000',
      ${actualValue}, ${opts.difference}::inventory_difference
    )
  `
  return count.id
}

/** Assess readiness for a completeness seed under its own organization. */
async function assessCompleteness(seed: DoubleEntrySeed) {
  return await withOrganization(seed.ctx.organizationId, seed.userId, (db) =>
    assessPeriodCloseReadiness(db, seed.ctx, seed.periodId),
  )
}

describe("period close readiness", () => {
  it("passes every available check for a clean double-entry period", async () => {
    const seed = await seedDoubleEntryOrg(organizationId, workspaceId, userId, {
      periodStart: "2050-01-01",
      periodEnd: "2050-12-31",
    })

    const readiness = await assess(seed)

    expect(readiness.ready).toBe(true)
    expect(
      readiness.checks
        .filter((check) => check.severity === "BLOCKER")
        .every((check) => check.status === "PASS"),
    ).toBe(true)
    expect(
      readiness.checks
        .filter((check) => check.severity === "WARNING")
        .every((check) => check.status === "UNAVAILABLE"),
    ).toBe(true)
    expect(blocker(readiness, "PENDING_BRAIN_PROPOSALS")).toMatchObject({
      severity: "BLOCKER",
      status: "PASS",
      count: 0,
    })
  })

  it("blocks only unresolved HELD proposals for this organization and period", async () => {
    const target = await seedDoubleEntryOrg(
      organizationId,
      workspaceId,
      userId,
      {
        periodStart: "2059-01-01",
        periodEnd: "2059-12-31",
      },
    )
    const otherPeriod = await seedDoubleEntryOrg(
      organizationId,
      workspaceId,
      userId,
      {
        periodStart: "2060-01-01",
        periodEnd: "2060-12-31",
      },
    )
    const otherOrganization = await seedDoubleEntryOrg(
      organizationBId,
      workspaceId,
      userBId,
      {
        periodStart: "2059-01-01",
        periodEnd: "2059-12-31",
      },
    )

    const pending = await admin<Array<{ id: string }>>`
      INSERT INTO tool_call_log (
        organization_id, period_id, tool_name, idempotency_key,
        actor_kind, user_id, input_json, auto_applied, approved_by_user_id
      )
      SELECT
        ${organizationId}::uuid,
        ${target.periodId}::uuid,
        'createAccountingEvent',
        'close-held-' || value,
        'human',
        ${userId}::uuid,
        jsonb_build_object('periodId', ${target.periodId}::text),
        false,
        NULL
      FROM generate_series(1, 4) AS value
      RETURNING id
    `
    await admin`
      INSERT INTO tool_call_log (
        organization_id, period_id, tool_name, idempotency_key,
        actor_kind, user_id, input_json, auto_applied, approved_by_user_id
      )
      VALUES
        (${organizationId}::uuid, ${otherPeriod.periodId}::uuid,
         'createAccountingEvent', 'close-held-other-period', 'human',
         ${userId}::uuid, jsonb_build_object('periodId', ${otherPeriod.periodId}::text),
         false, NULL),
        (${organizationBId}::uuid, ${otherOrganization.periodId}::uuid,
         'createAccountingEvent', 'close-held-other-org', 'human',
         ${userBId}::uuid, jsonb_build_object('periodId', ${otherOrganization.periodId}::text),
         false, NULL),
        (${organizationId}::uuid, ${target.periodId}::uuid,
         'createAccountingEvent', 'close-held-resolved', 'human',
         ${userId}::uuid, jsonb_build_object('periodId', ${target.periodId}::text),
         false, ${userId}::uuid),
        (${organizationId}::uuid, ${target.periodId}::uuid,
         'createAccountingEvent', 'close-held-auto-applied', 'human',
         ${userId}::uuid, jsonb_build_object('periodId', ${target.periodId}::text),
         true, NULL)
    `

    const readiness = await assess(target)
    const check = blocker(readiness, "PENDING_BRAIN_PROPOSALS")

    expect(readiness.ready).toBe(false)
    expect(check?.status).toBe("FAIL")
    expect(check?.count).toBe(4)
    expect(check?.references).toHaveLength(3)
    expect(check?.references?.[0]?.designation).toContain(
      "createAccountingEvent",
    )

    await admin`
      UPDATE tool_call_log
         SET approved_by_user_id = ${userId}::uuid
       WHERE id = ANY(${pending.map((row) => row.id)}::uuid[])
    `
  })

  it("fails closed when an unresolved accounting proposal lacks period linkage", async () => {
    const seed = await seedDoubleEntryOrg(organizationId, workspaceId, userId, {
      periodStart: "2061-01-01",
      periodEnd: "2061-12-31",
    })
    const [proposal] = await admin<Array<{ id: string }>>`
      INSERT INTO tool_call_log (
        organization_id, period_id, tool_name, idempotency_key,
        actor_kind, user_id, input_json
      )
      VALUES (
        ${organizationId}::uuid, NULL, 'createInvoice',
        'close-held-unscoped', 'human', ${userId}::uuid,
        jsonb_build_object('legacy', true)
      )
      RETURNING id
    `
    if (!proposal) throw new Error("unscoped proposal seed failed")

    const readiness = await assess(seed)
    const check = blocker(readiness, "PENDING_BRAIN_PROPOSALS")

    expect(readiness.ready).toBe(false)
    expect(check?.status).toBe("UNAVAILABLE")
    expect(check?.count).toBe(1)
    expect(check?.message).toContain("authoritative period linkage")

    await admin`
      UPDATE tool_call_log
         SET approved_by_user_id = ${userId}::uuid
       WHERE id = ${proposal.id}::uuid
    `
  })

  it("fails PERIOD_EXISTS safely for an unknown period", async () => {
    const seed = await seedDoubleEntryOrg(organizationId, workspaceId, userId, {
      periodStart: "2051-01-01",
      periodEnd: "2051-12-31",
    })
    const missingId = "00000000-0000-4000-8000-000000000001"

    const readiness = await withOrganization(organizationId, userId, (db) =>
      assessPeriodCloseReadiness(db, seed.ctx, missingId),
    )

    expect(readiness.ready).toBe(false)
    expect(blocker(readiness, "PERIOD_EXISTS")?.status).toBe("FAIL")
    expect(readiness.regimeCode).toBeNull()
    expect(readiness.periodStatus).toBeNull()
  })

  it("fails PERIOD_OPEN for a closed period", async () => {
    const seed = await seedDoubleEntryOrg(organizationId, workspaceId, userId, {
      periodStart: "2052-01-01",
      periodEnd: "2052-12-31",
    })
    await admin`
      UPDATE accounting_period SET status = 'CLOSED' WHERE id = ${seed.periodId}::uuid
    `

    const readiness = await assess(seed)

    expect(readiness.ready).toBe(false)
    expect(blocker(readiness, "PERIOD_OPEN")?.status).toBe("FAIL")
  })

  it("blocks unposted cases and bounds the disclosed references", async () => {
    const seed = await seedDoubleEntryOrg(organizationId, workspaceId, userId, {
      periodStart: "2053-01-01",
      periodEnd: "2053-12-31",
    })
    await withOrganization(organizationId, userId, async (db) => {
      for (let index = 0; index < 4; index += 1) {
        const event = await createEvent(db, seed.ctx, {
          periodId: seed.periodId,
          seriesId: seed.eventSeriesId,
          description: `Unposted close fixture ${index + 1}`,
          occurredAt: "2053-03-01",
          responsibleUserId: userId,
        })
        await captureDocument(db, seed.ctx, {
          periodId: seed.periodId,
          seriesId: seed.documentSeriesId,
          type: "RECEIVED_INVOICE",
          issuedAt: "2053-03-01",
          lines: [
            {
              eventId: event.eventId,
              partials: [
                {
                  baseAmount: "100.00",
                  vatRate: "0",
                  vatMode: "EXEMPT",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        })
      }
    })

    const readiness = await assess(seed)
    const check = blocker(readiness, "NO_UNPOSTED_CASES")

    expect(readiness.ready).toBe(false)
    expect(check?.status).toBe("FAIL")
    expect(check?.count).toBe(4)
    expect(check?.references).toHaveLength(3)
    expect(check?.references?.[0]?.designation).toContain("EV2053")
  })

  it("blocks an invoice posting line without a source link", async () => {
    const seed = await seedDoubleEntryOrg(organizationId, workspaceId, userId, {
      periodStart: "2054-01-01",
      periodEnd: "2054-12-31",
    })
    await withOrganization(organizationId, userId, async (db) => {
      const event = await createEvent(db, seed.ctx, {
        periodId: seed.periodId,
        seriesId: seed.eventSeriesId,
        description: "Unlinked invoice fixture",
        occurredAt: "2054-03-01",
        responsibleUserId: userId,
      })
      const document = await captureDocument(db, seed.ctx, {
        periodId: seed.periodId,
        seriesId: seed.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2054-03-01",
        lines: [
          {
            eventId: event.eventId,
            partials: [
              {
                baseAmount: "100.00",
                vatRate: "0",
                vatMode: "EXEMPT",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postDoubleEntry(db, seed.ctx, {
        periodId: seed.periodId,
        summaryRecordId: document.summaryRecordId,
        accountingEventId: event.eventId,
        postingDate: "2054-03-01",
        responsibleUserId: userId,
        lines: [
          {
            accountId: seed.accounts["504"]!,
            side: "DEBIT",
            amount: "100.00",
          },
          {
            accountId: seed.accounts["321"]!,
            side: "CREDIT",
            amount: "100.00",
          },
        ],
      })
    })

    const readiness = await assess(seed)

    expect(blocker(readiness, "NO_UNPOSTED_CASES")?.status).toBe("PASS")
    expect(blocker(readiness, "INVOICE_LINES_TRACEABLE")?.status).toBe("FAIL")
  })

  it("blocks read-model drift", async () => {
    const seed = await seedDoubleEntryOrg(organizationId, workspaceId, userId, {
      periodStart: "2055-01-01",
      periodEnd: "2055-12-31",
    })
    await postInternal(seed, "2055-03-01")
    await admin`
      UPDATE account_period_balance
         SET turnover_debit = turnover_debit + 1
       WHERE period_id = ${seed.periodId}::uuid
         AND account_id = ${seed.accounts["221"]}::uuid
    `

    const readiness = await assess(seed)

    expect(blocker(readiness, "READ_MODEL_RECONCILED")?.status).toBe("FAIL")
  })

  it("blocks an unbalanced posting", async () => {
    const seed = await seedDoubleEntryOrg(organizationId, workspaceId, userId, {
      periodStart: "2056-01-01",
      periodEnd: "2056-12-31",
    })
    const posting = await postInternal(seed, "2056-03-01")
    await admin.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`
      await tx`
        UPDATE posting_double_entry_line
           SET amount = 50
         WHERE posting_id = ${posting.postingId}::uuid
           AND side = 'CREDIT'
      `
      await tx`
        UPDATE account_period_balance
           SET turnover_credit = 50
         WHERE period_id = ${seed.periodId}::uuid
           AND account_id = ${seed.accounts["321"]}::uuid
      `
    })

    const readiness = await assess(seed)

    expect(blocker(readiness, "READ_MODEL_RECONCILED")?.status).toBe("PASS")
    expect(blocker(readiness, "POSTINGS_BALANCED")?.status).toBe("FAIL")
  })

  it("blocks failed analytical reconciliation", async () => {
    const seed = await seedDoubleEntryOrg(organizationId, workspaceId, userId, {
      periodStart: "2057-01-01",
      periodEnd: "2057-12-31",
    })
    const childId = await withOrganization(organizationId, userId, (db) =>
      createAccount(db, seed.ctx, {
        chartId: seed.chartId,
        periodId: seed.periodId,
        parentId: seed.accounts["221"],
        number: "221.001",
        name: "Analytical bank fixture",
        nature: "ASSET",
        normalBalance: "DEBIT",
      }),
    )
    const posting = await postInternal(seed, "2057-03-01", childId)
    await admin.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`
      await tx`
        UPDATE posting_double_entry_line
           SET account_id = ${seed.accounts["221"]}::uuid
         WHERE posting_id = ${posting.postingId}::uuid
           AND side = 'DEBIT'
      `
      await tx`
        UPDATE account_period_balance
           SET turnover_debit = 0
         WHERE period_id = ${seed.periodId}::uuid
           AND account_id = ${childId}::uuid
      `
      await tx`
        INSERT INTO account_period_balance
          (organization_id, period_id, account_id, turnover_debit)
        VALUES
          (${organizationId}::uuid, ${seed.periodId}::uuid, ${seed.accounts["221"]}::uuid, 100)
        ON CONFLICT (organization_id, period_id, account_id)
        DO UPDATE SET turnover_debit = EXCLUDED.turnover_debit
      `
    })

    const readiness = await assess(seed)

    expect(blocker(readiness, "READ_MODEL_RECONCILED")?.status).toBe("PASS")
    expect(blocker(readiness, "POSTINGS_BALANCED")?.status).toBe("PASS")
    expect(blocker(readiness, "ANALYTICS_RECONCILED")?.status).toBe("FAIL")
  })

  it("blocks when required number series are missing", async () => {
    const slug = `close-no-series-${Date.now()}`
    const [organization] = await admin<Array<{ id: string }>>`
      INSERT INTO organization
        (organization_id, workspace_id, slug, legal_name, person_kind, legal_subject_kind)
      VALUES
        (uuidv7(), ${workspaceId}::uuid, ${slug}, 'No Series Organization', 'legal_entity', 'for_profit')
      RETURNING id
    `
    if (!organization)
      throw new Error("missing-series organization seed failed")
    await admin`
      UPDATE organization SET organization_id = id WHERE id = ${organization.id}::uuid
    `
    const ctx = { organizationId: organization.id, workspaceId }
    const periodId = await withOrganization(organization.id, userId, (db) =>
      createPeriod(db, ctx, {
        periodStart: "2058-01-01",
        periodEnd: "2058-12-31",
        regimeCode: "DOUBLE_ENTRY",
        accountingCurrency: "CZK",
      }),
    )

    const readiness = await withOrganization(organization.id, userId, (db) =>
      assessPeriodCloseReadiness(db, ctx, periodId),
    )

    expect(readiness.ready).toBe(false)
    expect(blocker(readiness, "REQUIRED_NUMBER_SERIES_AVAILABLE")?.status).toBe(
      "FAIL",
    )
    expect(blocker(readiness, "REQUIRED_NUMBER_SERIES_AVAILABLE")?.count).toBe(
      2,
    )
  })
})

describe("asset and inventory completeness", () => {
  it("passes for an empty register and stays ready", async () => {
    const seed = await freshDoubleEntrySeed({
      periodStart: "2062-01-01",
      periodEnd: "2062-12-31",
    })

    const readiness = await assessCompleteness(seed)
    const check = blocker(readiness, "ASSET_AND_INVENTORY_COMPLETENESS")

    expect(check?.severity).toBe("BLOCKER")
    expect(check?.status).toBe("PASS")
    expect(check?.count).toBe(0)
    expect(readiness.ready).toBe(true)
  })

  it("passes when depreciable assets carry a plan and inventory counts match", async () => {
    const seed = await freshDoubleEntrySeed({
      periodStart: "2063-01-01",
      periodEnd: "2063-12-31",
    })
    const assetSeries = await createAssetSeries(seed)
    const inventorySeries = await createInventorySeries(seed)
    await insertAsset(seed, assetSeries, {
      category: "TANGIBLE_DEPRECIABLE",
      designation: "DHM2063-01",
      commissioningDate: "2063-02-01",
      withPlan: true,
    })
    await insertInventoryCount(seed, inventorySeries, {
      designation: "INV2063-01",
      countDate: "2063-12-31",
      difference: "MATCH",
    })

    const readiness = await assessCompleteness(seed)
    const check = blocker(readiness, "ASSET_AND_INVENTORY_COMPLETENESS")

    expect(check?.status).toBe("PASS")
    expect(check?.count).toBe(0)
    expect(readiness.ready).toBe(true)
  })

  it("ignores a non-depreciable asset without a plan and an asset disposed before the period", async () => {
    const seed = await freshDoubleEntrySeed({
      periodStart: "2064-01-01",
      periodEnd: "2064-12-31",
    })
    const assetSeries = await createAssetSeries(seed)
    const disposedSeries = await createAssetSeries(seed)
    // Land (non-depreciable) never needs a depreciation plan.
    await insertAsset(seed, assetSeries, {
      category: "TANGIBLE_NON_DEPRECIABLE",
      designation: "POZEMEK-2064",
      commissioningDate: "2064-03-01",
    })
    // A depreciable asset disposed before the period is out of scope for it.
    await insertAsset(seed, disposedSeries, {
      category: "TANGIBLE_DEPRECIABLE",
      designation: "DHM2064-OLD",
      commissioningDate: "2060-01-01",
      disposalDate: "2062-06-30",
    })

    const readiness = await assessCompleteness(seed)
    const check = blocker(readiness, "ASSET_AND_INVENTORY_COMPLETENESS")

    expect(check?.status).toBe("PASS")
    expect(check?.count).toBe(0)
    expect(readiness.ready).toBe(true)
  })

  it("blocks a depreciable asset with no depreciation plan", async () => {
    const seed = await freshDoubleEntrySeed({
      periodStart: "2065-01-01",
      periodEnd: "2065-12-31",
    })
    const assetSeries = await createAssetSeries(seed)
    await insertAsset(seed, assetSeries, {
      category: "TANGIBLE_DEPRECIABLE",
      designation: "DHM2065-01",
      commissioningDate: "2065-04-01",
    })

    const readiness = await assessCompleteness(seed)
    const check = blocker(readiness, "ASSET_AND_INVENTORY_COMPLETENESS")

    expect(readiness.ready).toBe(false)
    expect(check?.severity).toBe("BLOCKER")
    expect(check?.status).toBe("FAIL")
    expect(check?.count).toBe(1)
    expect(check?.references?.[0]?.designation).toContain("DHM2065-01")
  })

  it("blocks an inventory count with an unrecorded difference", async () => {
    const seed = await freshDoubleEntrySeed({
      periodStart: "2066-01-01",
      periodEnd: "2066-12-31",
    })
    const inventorySeries = await createInventorySeries(seed)
    await insertInventoryCount(seed, inventorySeries, {
      designation: "INV2066-01",
      countDate: "2066-12-31",
      difference: "SHORTAGE",
    })

    const readiness = await assessCompleteness(seed)
    const check = blocker(readiness, "ASSET_AND_INVENTORY_COMPLETENESS")

    expect(readiness.ready).toBe(false)
    expect(check?.status).toBe("FAIL")
    expect(check?.count).toBe(1)
    expect(check?.references?.[0]?.designation).toContain("INV2066-01")
  })

  it("refuses closePeriod when a depreciable asset has no depreciation plan", async () => {
    const seed = await freshDoubleEntrySeed({
      periodStart: "2067-01-01",
      periodEnd: "2067-12-31",
    })
    const assetSeries = await createAssetSeries(seed)
    await insertAsset(seed, assetSeries, {
      category: "TANGIBLE_DEPRECIABLE",
      designation: "DHM2067-01",
      commissioningDate: "2067-05-01",
    })

    await expect(
      withOrganization(seed.ctx.organizationId, seed.userId, (db) =>
        closePeriod(db, seed.ctx, {
          priorPeriodId: seed.periodId,
          responsibleUserId: seed.userId,
        }),
      ),
    ).rejects.toBeInstanceOf(PeriodCloseBlockedError)

    const [prior] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${seed.periodId}::uuid`
    expect(prior?.status).toBe("OPEN")
  })

  it("closes a period whose assets and inventory are complete", async () => {
    const seed = await freshDoubleEntrySeed({
      periodStart: "2068-01-01",
      periodEnd: "2068-12-31",
    })
    const assetSeries = await createAssetSeries(seed)
    const inventorySeries = await createInventorySeries(seed)
    await insertAsset(seed, assetSeries, {
      category: "TANGIBLE_DEPRECIABLE",
      designation: "DHM2068-01",
      commissioningDate: "2068-02-01",
      withPlan: true,
    })
    await insertInventoryCount(seed, inventorySeries, {
      designation: "INV2068-01",
      countDate: "2068-12-31",
      difference: "MATCH",
    })
    // Real balance-sheet activity so the close has balances to carry forward.
    await withOrganization(seed.ctx.organizationId, seed.userId, async (db) => {
      const event = await createEvent(db, seed.ctx, {
        periodId: seed.periodId,
        seriesId: seed.eventSeriesId,
        description: "Complete-book close fixture",
        occurredAt: "2068-06-01",
        responsibleUserId: seed.userId,
      })
      const document = await captureDocument(db, seed.ctx, {
        periodId: seed.periodId,
        seriesId: seed.documentSeriesId,
        type: "INTERNAL",
        issuedAt: "2068-06-01",
        lines: [],
      })
      await postDoubleEntry(db, seed.ctx, {
        periodId: seed.periodId,
        summaryRecordId: document.summaryRecordId,
        accountingEventId: event.eventId,
        postingDate: "2068-06-01",
        responsibleUserId: seed.userId,
        lines: [
          { accountId: seed.accounts["221"]!, side: "DEBIT", amount: "500.00" },
          {
            accountId: seed.accounts["321"]!,
            side: "CREDIT",
            amount: "500.00",
          },
        ],
      })
    })

    const result = await withOrganization(
      seed.ctx.organizationId,
      seed.userId,
      (db) =>
        closePeriod(db, seed.ctx, {
          priorPeriodId: seed.periodId,
          responsibleUserId: seed.userId,
        }),
    )

    expect(result.newPeriodId).not.toBe("")
    const [prior] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${seed.periodId}::uuid`
    expect(prior?.status).toBe("CLOSED")
  })
})
