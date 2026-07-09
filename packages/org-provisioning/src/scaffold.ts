/**
 * scaffoldOrganization — the org creation-scaffolding protocol. One callable
 * process that mints a fully-configured, ready-to-book účetní jednotka.
 *
 * Consumes ONLY the flat, validated ScaffoldInput (no HTTP — prefill already
 * ran). One atomic transaction: the platform rows are written under
 * withAdminBypass (the org can't satisfy its own org-scoped RLS mid-creation,
 * exactly like onboarding), and the accounting master-data is written through a
 * nested withOrganization(outerTx) frame so the domain primitives run against a
 * properly org-bound executor in the SAME transaction.
 *
 * Idempotent: a client idempotency key claims a workspace-tier
 * organization_provisioning row; a retry replays the recorded org instead of
 * creating a second one.
 */
import { sql } from "drizzle-orm"
import { withAdminBypass, withOrganization, executeRows } from "@workspace/db"
import type { AdminBypassDb, OrganizationBoundDb } from "@workspace/db"
import type { OrgCtx } from "@workspace/accounting"
import {
  createVatStatus,
  createCounterparty,
  createCategory,
} from "@workspace/accounting"
import { scaffoldAccountingPeriod } from "./accounting-scaffold"
import { ScaffoldInput, type ScaffoldInputRaw } from "./input"
import { slugify, isReservedSlug } from "./slug"
import {
  deriveRegime,
  assertRegimeVatCompatible,
  type Regime,
  type LegalFormFacts,
} from "./regime"
import { derivePeriodBounds } from "./period"
import { ScaffoldValidationError } from "./errors"

export interface ScaffoldResult {
  organizationId: string
  slug: string
  periodId: string
  chartId: string | null
  accountsSeeded: number
  regime: Regime
  /** true when a prior attempt with the same idempotency key was replayed. */
  replayed: boolean
  /** Follow-up work the entity needs before it is fully bookable. */
  nextRequiredTasks: string[]
}

/** Nonprofit legal forms book under Vyhláška 504/2002 — a chart we don't seed. */
const NONPROFIT_FORMS: ReadonlySet<string> = new Set([
  "SPOLEK",
  "NADACE",
  "USTAV",
  "SVJ",
])

/** Default peněžní-deník categories for monetary regimes (daňové / nedaňové). */
const DEFAULT_CATEGORIES = [
  { type: "INCOME", name: "Příjmy zahrnované do základu daně" },
  { type: "INCOME", name: "Příjmy nezahrnované do základu daně" },
  { type: "EXPENSE", name: "Výdaje daňově uznatelné" },
  { type: "EXPENSE", name: "Výdaje daňově neuznatelné" },
] as const

export async function scaffoldOrganization(
  raw: ScaffoldInputRaw,
): Promise<ScaffoldResult> {
  const input = ScaffoldInput.parse(raw)

  // Fast-path replay (before opening the create transaction).
  const existing = await findExistingProvisioning(
    input.workspaceId,
    input.idempotencyKey,
  )
  if (existing) return existing

  try {
    return await withAdminBypass((adminDb) =>
      createOrganization(adminDb, input),
    )
  } catch (err) {
    // Concurrent request won the idempotency key: our whole tx rolled back
    // (atomic), so replay the winner's result.
    if (isUniqueViolation(err)) {
      const replay = await findExistingProvisioning(
        input.workspaceId,
        input.idempotencyKey,
      )
      if (replay) return replay
    }
    throw err
  }
}

async function createOrganization(
  adminDb: AdminBypassDb,
  input: ScaffoldInput,
): Promise<ScaffoldResult> {
  // --- 1. Legal-form facts → regime derivation + statutory cross-checks ------
  const formRows = await executeRows<{ mandatory_double_entry: boolean }>(
    adminDb,
    sql`SELECT mandatory_double_entry FROM legal_form WHERE code = ${input.legalFormCode}`,
  )
  if (!formRows[0]) {
    throw new ScaffoldValidationError(
      `unknown legal form: ${input.legalFormCode}`,
      "REGIME_NOT_ALLOWED",
    )
  }
  const allowedRows = await executeRows<{ regime_code: Regime }>(
    adminDb,
    sql`SELECT regime_code FROM legal_form_allowed_regime WHERE legal_form_code = ${input.legalFormCode}`,
  )
  const facts: LegalFormFacts = {
    allowedRegimes: allowedRows.map((r) => r.regime_code),
    mandatoryDoubleEntry: formRows[0].mandatory_double_entry,
    inPublicRegister: input.inPublicRegister,
  }
  const derivation = deriveRegime(facts, input.regimeCode)
  if ("ambiguous" in derivation) {
    throw new ScaffoldValidationError(
      `regime is ambiguous for ${input.legalFormCode}; choose one of ${derivation.allowed.join(", ")}`,
      "REGIME_AMBIGUOUS",
    )
  }
  const regime = derivation.resolved
  assertRegimeVatCompatible(regime, input.vatRegimeCode)

  const requiresChartRows = await executeRows<{ requires: boolean }>(
    adminDb,
    sql`SELECT requires_chart_of_accounts AS requires FROM regime WHERE code = ${regime}`,
  )
  const requiresChart = requiresChartRows[0]?.requires ?? false

  const isNonprofit =
    input.legalSubjectKind === "non_profit" ||
    NONPROFIT_FORMS.has(input.legalFormCode)
  if (requiresChart && isNonprofit) {
    throw new ScaffoldValidationError(
      "nonprofit double-entry (Vyhláška 504/2002) is not supported yet",
      "NONPROFIT_DOUBLE_ENTRY_UNSUPPORTED",
    )
  }

  if (
    (input.vatRegimeCode === "PAYER" ||
      input.vatRegimeCode === "IDENTIFIED_PERSON") &&
    !input.dic
  ) {
    throw new ScaffoldValidationError(
      "a VAT payer / identified person requires a DIČ",
      "VAT_PAYER_REQUIRES_DIC",
    )
  }

  if (regime === "TAX_RECORDS" && input.fiscalYearStartMonth !== 1) {
    throw new ScaffoldValidationError(
      "daňová evidence uses the calendar year (fiscalYearStartMonth must be 1)",
      "INVALID_FISCAL_YEAR_START",
    )
  }

  // OSS (One-Stop-Shop) is available only to a VAT payer / identified person
  // (§110k ZDPH) — a non-payer cannot register.
  if (input.oss && input.vatRegimeCode === "NON_PAYER") {
    throw new ScaffoldValidationError(
      "OSS requires VAT registration (plátce / identifikovaná osoba)",
      "OSS_REQUIRES_VAT_REGISTRATION",
    )
  }

  // --- 2. Period bounds ------------------------------------------------------
  const bounds = derivePeriodBounds({
    entityKind: input.entityKind,
    regime,
    fiscalYearStartMonth: input.fiscalYearStartMonth,
    registeredAt: input.registeredAt,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    fiscalYear: input.fiscalYear,
  })

  // --- 3. Platform rows (admin bypass — org can't satisfy its own RLS yet) ---
  const base = input.slug ?? slugify(input.legalName)
  const slug = await pickUniqueSlug(adminDb, input.workspaceId, base)

  const addr = input.address ?? {}
  // organization_person_subject_consistency (0003): a natural person must have
  // NULL legal_subject_kind; a legal entity must have a non-null one.
  const legalSubjectKind =
    input.personKind === "natural_person" ? null : input.legalSubjectKind
  const delivery = input.deliveryAddressLines ?? []
  const orgRows = await executeRows<{ id: string }>(
    adminDb,
    sql`INSERT INTO organization
          (organization_id, workspace_id, slug, legal_name, person_kind, legal_subject_kind,
           legal_form_code, ico, registered_street, registered_house_number,
           registered_orientation_number, registered_city, registered_postal_code,
           registered_region, registered_country_code, delivery_address_line1,
           delivery_address_line2, delivery_address_line3, data_box_id, contact_email,
           contact_phone, website, tax_office_code, tax_office_workplace_code,
           registry_file_number, fiscal_year_start_month)
        VALUES
          (uuidv7(), ${input.workspaceId}::uuid, ${slug}, ${input.legalName}, ${input.personKind},
           ${legalSubjectKind}, ${input.legalFormCode}, ${input.ico ?? null},
           ${addr.street ?? null}, ${addr.houseNumber ?? null}, ${addr.orientationNumber ?? null},
           ${addr.city ?? null}, ${addr.postalCode ?? null}, ${addr.region ?? null},
           ${addr.countryCode ?? null}, ${delivery[0] ?? null}, ${delivery[1] ?? null},
           ${delivery[2] ?? null}, ${input.dataBoxId ?? null}, ${input.contactEmail ?? null},
           ${input.contactPhone ?? null}, ${input.website ?? null}, ${input.taxOfficeCode ?? null},
           ${input.taxOfficeWorkplaceCode ?? null}, ${input.registryFileNumber ?? null},
           ${input.fiscalYearStartMonth})
        RETURNING id`,
  )
  const orgId = orgRows[0]!.id
  // Self-id: organization_id = id (trigger enforces equality once the row exists).
  await adminDb.execute(
    sql`UPDATE organization SET organization_id = id WHERE id = ${orgId}::uuid`,
  )

  const wsmRows = await executeRows<{ id: string }>(
    adminDb,
    sql`SELECT id FROM workspace_membership
        WHERE workspace_id = ${input.workspaceId}::uuid
          AND user_id = ${input.ownerUserId}::uuid AND active = true
        LIMIT 1`,
  )
  if (!wsmRows[0]) {
    throw new Error(
      "scaffoldOrganization: owner is not an active member of the workspace",
    )
  }
  await adminDb.execute(
    sql`INSERT INTO organization_membership
          (organization_id, workspace_id, user_id, workspace_membership_id, role)
        VALUES (${orgId}::uuid, ${input.workspaceId}::uuid, ${input.ownerUserId}::uuid,
                ${wsmRows[0].id}::uuid, 'owner')`,
  )

  // NACE links — only codes that exist in the reference table (seed is minimal).
  if (input.businessActivityCodes.length > 0) {
    await adminDb.execute(
      sql`INSERT INTO organization_business_activity (organization_id, business_activity_code)
          SELECT ${orgId}::uuid, ba.code FROM business_activity ba
          WHERE ba.code = ANY(${sql`ARRAY[${sql.join(
            input.businessActivityCodes.map((c) => sql`${c}`),
            sql`, `,
          )}]::text[]`})
          ON CONFLICT DO NOTHING`,
    )
  }

  // Claim the idempotency key (unique(workspace_id, idempotency_key)). A
  // concurrent duplicate aborts here and the whole tx rolls back atomically.
  const { aresSnapshot, dphSnapshot, ...storedInput } = input
  await adminDb.execute(
    sql`INSERT INTO organization_provisioning
          (workspace_id, idempotency_key, input, ares_snapshot, dph_snapshot, organization_id)
        VALUES (${input.workspaceId}::uuid, ${input.idempotencyKey},
                ${JSON.stringify(storedInput)}::jsonb,
                ${aresSnapshot ? JSON.stringify(aresSnapshot) : null}::jsonb,
                ${dphSnapshot ? JSON.stringify(dphSnapshot) : null}::jsonb,
                ${orgId}::uuid)`,
  )

  // --- 4. Accounting master-data (nested org-bound frame, same tx) -----------
  const ctx: OrgCtx = {
    organizationId: orgId,
    workspaceId: input.workspaceId,
  }
  const acct = await withOrganization(
    orgId,
    input.ownerUserId,
    async (orgDb: OrganizationBoundDb) => {
      await createVatStatus(orgDb, ctx, {
        vatRegimeCode: input.vatRegimeCode,
        validFrom: input.vatValidFrom ?? bounds.periodStart,
        filingPeriod:
          input.vatRegimeCode === "PAYER"
            ? (input.vatFilingPeriod ?? "MONTHLY")
            : null,
      })

      // The coupled accounting scaffold (period + chart + number series) — the
      // single shared path POST /v1/accounting/periods also calls, so a period
      // is never minted without its chart + series (#579).
      const { periodId, chartId, accountsSeeded } =
        await scaffoldAccountingPeriod(
          orgDb,
          {
            organizationId: orgId,
            workspaceId: input.workspaceId,
            regime,
            requiresChart,
          },
          {
            periodStart: bounds.periodStart,
            periodEnd: bounds.periodEnd,
            accountingCurrency: input.accountingCurrency,
            accountingSizeCode: input.accountingSizeCode ?? null,
            fxRatePolicy: input.fxRatePolicy ?? null,
          },
        )

      await createCounterparty(orgDb, ctx, {
        selfOfOrganizationId: orgId,
        name: input.legalName,
        taxId: input.dic ?? null,
        countryCode: input.address?.countryCode ?? "CZ",
      })

      // Monetary regimes (SINGLE_ENTRY + TAX_RECORDS) need income/expense
      // categories to be ready-to-book; double-entry uses the chart instead.
      if (!requiresChart) {
        for (const category of DEFAULT_CATEGORIES) {
          await createCategory(orgDb, ctx, category)
        }
      }

      // Optional config satellites (org-scoped; RLS satisfied by the GUC).
      if (input.authorizedPerson) {
        await orgDb.execute(
          sql`INSERT INTO organization_authorized_person
                (organization_id, given_name, family_name, position, is_primary)
              VALUES (${orgId}::uuid, ${input.authorizedPerson.givenName},
                      ${input.authorizedPerson.familyName},
                      ${input.authorizedPerson.position ?? null}, true)`,
        )
      }
      if (input.oss) {
        await orgDb.execute(
          sql`INSERT INTO organization_oss_registration
                (organization_id, scheme, valid_from)
              VALUES (${orgId}::uuid, ${input.oss.scheme}, ${input.oss.validFrom}::date)`,
        )
      }

      return { periodId, chartId, accountsSeeded }
    },
    adminDb,
  )

  // Opening balances are user-supplied (základní kapitál / conversion balances,
  // posted as 701) — declared as follow-up, not auto-created (advisor answer 2).
  const nextRequiredTasks: string[] = []
  if (
    input.entityKind === "MIGRATED_ENTITY" ||
    input.personKind === "legal_entity"
  ) {
    nextRequiredTasks.push("OPENING_BALANCES")
  }

  return {
    organizationId: orgId,
    slug,
    periodId: acct.periodId,
    chartId: acct.chartId,
    accountsSeeded: acct.accountsSeeded,
    regime,
    replayed: false,
    nextRequiredTasks,
  }
}

async function pickUniqueSlug(
  db: AdminBypassDb,
  workspaceId: string,
  base: string,
): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    // A reserved slug would be unreachable at /{slug}; try the next numbered form.
    if (isReservedSlug(candidate)) continue
    const rows = await executeRows<{ id: string }>(
      db,
      sql`SELECT id FROM organization
          WHERE workspace_id = ${workspaceId}::uuid AND slug = ${candidate} LIMIT 1`,
    )
    if (!rows[0]) return candidate
  }
  throw new Error("scaffoldOrganization: could not pick a unique slug")
}

async function findExistingProvisioning(
  workspaceId: string,
  idempotencyKey: string,
): Promise<ScaffoldResult | null> {
  return await withAdminBypass(async (db) => {
    const rows = await executeRows<{
      organization_id: string | null
      slug: string | null
    }>(
      db,
      sql`SELECT p.organization_id, o.slug
          FROM organization_provisioning p
          LEFT JOIN organization o ON o.id = p.organization_id
          WHERE p.workspace_id = ${workspaceId}::uuid
            AND p.idempotency_key = ${idempotencyKey}
          LIMIT 1`,
    )
    const row = rows[0]
    if (!row?.organization_id) return null
    const orgId = row.organization_id

    const period = await executeRows<{ id: string; regime_code: Regime }>(
      db,
      sql`SELECT id, regime_code FROM accounting_period
          WHERE organization_id = ${orgId}::uuid
          ORDER BY period_start LIMIT 1`,
    )
    const chart = await executeRows<{ id: string }>(
      db,
      sql`SELECT c.id FROM chart_of_accounts c
          JOIN accounting_period ap ON ap.id = c.period_id
          WHERE c.organization_id = ${orgId}::uuid
          ORDER BY ap.period_start LIMIT 1`,
    )
    const count = chart[0]
      ? await executeRows<{ n: number }>(
          db,
          sql`SELECT count(*)::int AS n FROM account WHERE chart_id = ${chart[0].id}::uuid`,
        )
      : []

    return {
      organizationId: orgId,
      slug: row.slug ?? "",
      periodId: period[0]?.id ?? "",
      chartId: chart[0]?.id ?? null,
      accountsSeeded: count[0]?.n ?? 0,
      regime: period[0]?.regime_code ?? "DOUBLE_ENTRY",
      replayed: true,
      nextRequiredTasks: [],
    }
  })
}

/** Postgres unique_violation (SQLSTATE 23505), possibly wrapped by the driver. */
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err
  for (let i = 0; i < 5 && cur; i++) {
    const code = (cur as { code?: unknown }).code
    if (code === "23505") return true
    cur = (cur as { cause?: unknown }).cause
  }
  return (
    err instanceof Error &&
    err.message.includes("organization_provisioning_key_unique")
  )
}
