/**
 * Server-side data + mutations for the organization settings pages.
 * Access is resolved by (slug, userId) — the same key the [orgSlug] layout uses.
 * Every write runs inside `withOrganization` (FORCE RLS); the owner/admin role
 * gate lives in the calling server action (see actions.ts).
 */
import "server-only"
import { sql } from "drizzle-orm"
import { executeRows, withAdminBypass, withOrganization } from "@workspace/db"
import {
  backfillDefaultNumberSeries,
  createTaxProfile,
  createVatStatus,
  rollForwardPeriod,
  type OrgCtx,
  type VatFilingPeriod,
  type VatRegime,
} from "@workspace/accounting"
import { getRequestSession } from "../../_lib/request-session"
import { collectOrgUpdates, type OrgSettingsUpdate } from "./org-update"

/** Next účetní období bounds: prior end + 1 day → + 1 year − 1 day. */
function nextBounds(priorEnd: string): { start: string; end: string } {
  const d = new Date(`${priorEnd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  const start = d.toISOString().slice(0, 10)
  const e = new Date(d)
  e.setUTCFullYear(e.getUTCFullYear() + 1)
  e.setUTCDate(e.getUTCDate() - 1)
  return { start, end: e.toISOString().slice(0, 10) }
}

export interface OrgContext {
  organizationId: string
  workspaceId: string
  role: "owner" | "admin" | "member" | "agent" | "guest"
}

export async function resolveOrgContext(
  slug: string,
  userId: string,
): Promise<OrgContext | null> {
  return await withAdminBypass(async (db) => {
    const rows = await executeRows<{
      organization_id: string
      workspace_id: string
      role: OrgContext["role"]
    }>(
      db,
      sql`SELECT o.id AS organization_id, o.workspace_id, m.role
          FROM organization o
          JOIN organization_membership m
            ON m.organization_id = o.id AND m.user_id = ${userId}::uuid AND m.active = true
          WHERE o.slug = ${slug}
          LIMIT 1`,
    )
    const row = rows[0]
    if (!row) return null
    return {
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      role: row.role,
    }
  })
}

/**
 * Resolve the session + org context for a settings page (server components).
 * Returns null when unauthenticated or the user has no membership for the slug;
 * `canEdit` mirrors the write gate in the server actions (owner/admin only).
 * The layout has already gated access; this re-resolve recovers the ids and
 * role the RSC tree cannot pass down.
 */
export async function getSettingsPageContext(
  slug: string,
): Promise<{ ctx: OrgContext; userId: string; canEdit: boolean } | null> {
  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return null
  const ctx = await resolveOrgContext(slug, userId)
  if (!ctx) return null
  return { ctx, userId, canEdit: ctx.role === "owner" || ctx.role === "admin" }
}

export interface PeriodRow {
  id: string
  periodStart: string
  periodEnd: string
  status: string
  regimeCode: string
}

export interface PersonRow {
  id: string
  givenName: string
  familyName: string
  position: string | null
  isPrimary: boolean
}

/** A row from the shared `legal_form` reference table (for the identity select). */
export interface LegalFormOption {
  code: string
  name: string
}

export interface OrgSettingsData {
  id: string
  slug: string
  legalName: string
  legalFormCode: string | null
  personKind: string
  ico: string | null
  dic: string | null
  dataBoxId: string | null
  contactEmail: string | null
  contactPhone: string | null
  website: string | null
  registeredStreet: string | null
  registeredHouseNumber: string | null
  registeredOrientationNumber: string | null
  registeredCity: string | null
  registeredPostalCode: string | null
  registeredRegion: string | null
  taxOfficeCode: string | null
  registryFileNumber: string | null
  people: PersonRow[]
  /** Reference legal forms matching the org's person kind (natural / legal). */
  legalForms: LegalFormOption[]
}

/** Identity + contact + signatories for the Identity settings page. */
export async function loadOrgSettings(
  ctx: OrgContext,
  userId: string,
): Promise<OrgSettingsData> {
  return await withOrganization(ctx.organizationId, userId, async (db) => {
    const [org] = await executeRows<{
      id: string
      slug: string
      legal_name: string
      legal_form_code: string | null
      person_kind: string
      person_type: string | null
      ico: string | null
      data_box_id: string | null
      contact_email: string | null
      contact_phone: string | null
      website: string | null
      registered_street: string | null
      registered_house_number: string | null
      registered_orientation_number: string | null
      registered_city: string | null
      registered_postal_code: string | null
      registered_region: string | null
      tax_office_code: string | null
      registry_file_number: string | null
    }>(
      db,
      sql`SELECT id, slug, legal_name, legal_form_code, person_kind, person_type, ico, data_box_id,
                 contact_email, contact_phone, website, registered_street, registered_house_number,
                 registered_orientation_number, registered_city, registered_postal_code,
                 registered_region, tax_office_code, registry_file_number
          FROM organization WHERE id = ${ctx.organizationId}::uuid`,
    )
    const [self] = await executeRows<{ tax_id: string | null }>(
      db,
      sql`SELECT tax_id FROM counterparty WHERE self_of_organization_id = ${ctx.organizationId}::uuid`,
    )
    const people = await executeRows<{
      id: string
      given_name: string
      family_name: string
      position: string | null
      is_primary: boolean
    }>(
      db,
      sql`SELECT id, given_name, family_name, position, is_primary
          FROM organization_authorized_person
          WHERE organization_id = ${ctx.organizationId}::uuid
          ORDER BY is_primary DESC, family_name`,
    )
    // legal_form is a shared reference table (not org-scoped); filter to the
    // org's person type so the select only offers valid forms.
    const legalForms = await executeRows<{ code: string; name: string }>(
      db,
      sql`SELECT code, name FROM legal_form
          WHERE person_type = ${org!.person_type}
          ORDER BY name`,
    )

    return {
      id: org!.id,
      slug: org!.slug,
      legalName: org!.legal_name,
      legalFormCode: org!.legal_form_code,
      personKind: org!.person_kind,
      ico: org!.ico,
      dic: self?.tax_id ?? null,
      dataBoxId: org!.data_box_id,
      contactEmail: org!.contact_email,
      contactPhone: org!.contact_phone,
      website: org!.website,
      registeredStreet: org!.registered_street,
      registeredHouseNumber: org!.registered_house_number,
      registeredOrientationNumber: org!.registered_orientation_number,
      registeredCity: org!.registered_city,
      registeredPostalCode: org!.registered_postal_code,
      registeredRegion: org!.registered_region,
      taxOfficeCode: org!.tax_office_code,
      registryFileNumber: org!.registry_file_number,
      people: people.map((p) => ({
        id: p.id,
        givenName: p.given_name,
        familyName: p.family_name,
        position: p.position,
        isPrimary: p.is_primary,
      })),
      legalForms: legalForms.map((f) => ({ code: f.code, name: f.name })),
    }
  })
}

/** The accounting periods list for the Periods & fiscal year page. */
export async function loadPeriods(
  ctx: OrgContext,
  userId: string,
): Promise<PeriodRow[]> {
  return await withOrganization(ctx.organizationId, userId, async (db) => {
    const periods = await executeRows<{
      id: string
      period_start: string
      period_end: string
      status: string
      regime_code: string
    }>(
      db,
      sql`SELECT id, period_start::text, period_end::text, status, regime_code
          FROM accounting_period WHERE organization_id = ${ctx.organizationId}::uuid
          ORDER BY period_start DESC`,
    )
    return periods.map((p) => ({
      id: p.id,
      periodStart: p.period_start,
      periodEnd: p.period_end,
      status: p.status,
      regimeCode: p.regime_code,
    }))
  })
}

export interface VatStatusRow {
  id: string
  vatRegimeCode: string
  filingPeriod: string | null
  validFrom: string
  validTo: string | null
}

export interface OssRow {
  id: string
  scheme: string
  validFrom: string
  validTo: string | null
}

export interface TaxRepresentativeRow {
  id: string
  representativeType: string | null
  legalName: string | null
  givenName: string | null
  familyName: string | null
  ico: string | null
  dic: string | null
  advisorRegistrationNumber: string | null
}

export interface VatStatusData {
  /** vat_regime reference labels for the change form select. */
  regimes: Array<{ code: string; name: string }>
  history: VatStatusRow[]
  oss: OssRow[]
  representative: TaxRepresentativeRow | null
}

/** VAT status history + OSS registrations + tax representative for the page. */
export async function loadVatStatus(
  ctx: OrgContext,
  userId: string,
): Promise<VatStatusData> {
  return await withOrganization(ctx.organizationId, userId, async (db) => {
    const regimes = await executeRows<{ code: string; name: string }>(
      db,
      sql`SELECT code, name FROM vat_regime ORDER BY code`,
    )
    const history = await executeRows<{
      id: string
      vat_regime_code: string
      filing_period: string | null
      valid_from: string
      valid_to: string | null
    }>(
      db,
      sql`SELECT id, vat_regime_code, filing_period, valid_from::text, valid_to::text
          FROM vat_status WHERE organization_id = ${ctx.organizationId}::uuid
          ORDER BY valid_from DESC`,
    )
    const oss = await executeRows<{
      id: string
      scheme: string
      valid_from: string
      valid_to: string | null
    }>(
      db,
      sql`SELECT id, scheme, valid_from::text, valid_to::text
          FROM organization_oss_registration
          WHERE organization_id = ${ctx.organizationId}::uuid
          ORDER BY valid_from DESC`,
    )
    const [rep] = await executeRows<{
      id: string
      representative_type: string | null
      legal_name: string | null
      given_name: string | null
      family_name: string | null
      ico: string | null
      dic: string | null
      advisor_registration_number: string | null
    }>(
      db,
      sql`SELECT id, representative_type, legal_name, given_name, family_name,
                 ico, dic, advisor_registration_number
          FROM organization_tax_representative
          WHERE organization_id = ${ctx.organizationId}::uuid
          ORDER BY is_primary DESC LIMIT 1`,
    )
    return {
      regimes: regimes.map((r) => ({ code: r.code, name: r.name })),
      history: history.map((r) => ({
        id: r.id,
        vatRegimeCode: r.vat_regime_code,
        filingPeriod: r.filing_period,
        validFrom: r.valid_from,
        validTo: r.valid_to,
      })),
      oss: oss.map((r) => ({
        id: r.id,
        scheme: r.scheme,
        validFrom: r.valid_from,
        validTo: r.valid_to,
      })),
      representative: rep
        ? {
            id: rep.id,
            representativeType: rep.representative_type,
            legalName: rep.legal_name,
            givenName: rep.given_name,
            familyName: rep.family_name,
            ico: rep.ico,
            dic: rep.dic,
            advisorRegistrationNumber: rep.advisor_registration_number,
          }
        : null,
    }
  })
}

export interface TaxProfileRow {
  id: string
  hasEmployees: boolean
  hasStandardEmployment: boolean | null
  hasDpp: boolean | null
  hasDpc: boolean | null
  socialInsuranceParticipation: boolean | null
  healthInsuranceParticipation: boolean | null
  payrollTaxAdvanceDue: boolean | null
  specialRateWithholdingDue: boolean | null
  validFrom: string
  validTo: string | null
}

export interface PayrollProfileInput {
  hasStandardEmployment: boolean
  hasDpp: boolean
  hasDpc: boolean
  socialInsuranceParticipation: boolean
  healthInsuranceParticipation: boolean
  payrollTaxAdvanceDue: boolean
  specialRateWithholdingDue: boolean
  validFrom: string
}

export interface TaxProfileData {
  history: TaxProfileRow[]
}

/** Effective payroll relationship and remittance history for the page. */
export async function loadTaxProfile(
  ctx: OrgContext,
  userId: string,
): Promise<TaxProfileData> {
  return await withOrganization(ctx.organizationId, userId, async (db) => {
    const history = await executeRows<{
      id: string
      has_employees: boolean
      has_standard_employment: boolean | null
      has_dpp: boolean | null
      has_dpc: boolean | null
      social_insurance_participation: boolean | null
      health_insurance_participation: boolean | null
      payroll_tax_advance_due: boolean | null
      special_rate_withholding_due: boolean | null
      valid_from: string
      valid_to: string | null
    }>(
      db,
      sql`SELECT id, has_employees, has_standard_employment, has_dpp, has_dpc,
                 social_insurance_participation, health_insurance_participation,
                 payroll_tax_advance_due, special_rate_withholding_due,
                 valid_from::text, valid_to::text
          FROM organization_tax_profile WHERE organization_id = ${ctx.organizationId}::uuid
          ORDER BY valid_from DESC`,
    )
    return {
      history: history.map((r) => ({
        id: r.id,
        hasEmployees: r.has_employees,
        hasStandardEmployment: r.has_standard_employment,
        hasDpp: r.has_dpp,
        hasDpc: r.has_dpc,
        socialInsuranceParticipation: r.social_insurance_participation,
        healthInsuranceParticipation: r.health_insurance_participation,
        payrollTaxAdvanceDue: r.payroll_tax_advance_due,
        specialRateWithholdingDue: r.special_rate_withholding_due,
        validFrom: r.valid_from,
        validTo: r.valid_to,
      })),
    }
  })
}

/** Data box id only — the Integrations › Data box page. */
export async function loadDataBox(
  ctx: OrgContext,
  userId: string,
): Promise<{ dataBoxId: string | null }> {
  return await withOrganization(ctx.organizationId, userId, async (db) => {
    const [org] = await executeRows<{ data_box_id: string | null }>(
      db,
      sql`SELECT data_box_id FROM organization WHERE id = ${ctx.organizationId}::uuid`,
    )
    return { dataBoxId: org?.data_box_id ?? null }
  })
}

/** Update the mutable identity/contact columns. Owner/admin only (gated by caller). */
export async function updateOrgConfig(
  ctx: OrgContext,
  userId: string,
  values: OrgSettingsUpdate,
): Promise<void> {
  const pairs = collectOrgUpdates(values)
  if (pairs.length === 0) return
  const assignments = pairs.map(
    ([col, val]) => sql`${sql.identifier(col)} = ${val}`,
  )
  await withOrganization(ctx.organizationId, userId, async (db) => {
    await db.execute(
      sql`UPDATE organization SET ${sql.join(assignments, sql`, `)}, updated_at = now()
          WHERE id = ${ctx.organizationId}::uuid`,
    )
  })
}

/** Add an authorized person (signatory). A new primary demotes any existing one. */
export async function addAuthorizedPerson(
  ctx: OrgContext,
  userId: string,
  input: {
    givenName: string
    familyName: string
    position: string | null
    isPrimary: boolean
  },
): Promise<void> {
  await withOrganization(ctx.organizationId, userId, async (db) => {
    if (input.isPrimary) {
      // Only one primary per org (partial-unique index) — demote the current one.
      await db.execute(
        sql`UPDATE organization_authorized_person SET is_primary = false, updated_at = now()
            WHERE organization_id = ${ctx.organizationId}::uuid AND is_primary`,
      )
    }
    await db.execute(
      sql`INSERT INTO organization_authorized_person
            (organization_id, given_name, family_name, position, is_primary)
          VALUES (${ctx.organizationId}::uuid, ${input.givenName}, ${input.familyName},
                  ${input.position}, ${input.isPrimary})`,
    )
  })
}

/** Remove an authorized person by id (RLS scopes the delete to the org). */
export async function removeAuthorizedPerson(
  ctx: OrgContext,
  userId: string,
  personId: string,
): Promise<void> {
  await withOrganization(ctx.organizationId, userId, async (db) => {
    await db.execute(
      sql`DELETE FROM organization_authorized_person
          WHERE id = ${personId}::uuid AND organization_id = ${ctx.organizationId}::uuid`,
    )
  })
}

/**
 * Change the VAT status: close the open row (valid_to = day before the new
 * start) and insert the new one via the accounting domain helper. The
 * vat_status_no_overlap gist EXCLUDE rejects any range collision.
 */
export async function changeVatStatus(
  ctx: OrgContext,
  userId: string,
  input: {
    vatRegimeCode: VatRegime
    validFrom: string
    filingPeriod: VatFilingPeriod | null
  },
): Promise<void> {
  await withOrganization(ctx.organizationId, userId, async (db) => {
    const priorDay = new Date(`${input.validFrom}T00:00:00Z`)
    priorDay.setUTCDate(priorDay.getUTCDate() - 1)
    const closeAt = priorDay.toISOString().slice(0, 10)
    await db.execute(
      sql`UPDATE vat_status SET valid_to = ${closeAt}::date
          WHERE organization_id = ${ctx.organizationId}::uuid AND valid_to IS NULL`,
    )
    const orgCtx: OrgCtx = {
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
    }
    await createVatStatus(db, orgCtx, {
      vatRegimeCode: input.vatRegimeCode,
      validFrom: input.validFrom,
      filingPeriod: input.filingPeriod,
    })
  })
}

/**
 * Change the tax profile: close the open row (valid_to = day before the new
 * start) and insert the new one via the accounting domain helper. The
 * organization_tax_profile_no_overlap gist EXCLUDE rejects any range collision.
 */
export async function changeTaxProfile(
  ctx: OrgContext,
  userId: string,
  input: PayrollProfileInput,
): Promise<void> {
  await withOrganization(ctx.organizationId, userId, async (db) => {
    const priorDay = new Date(`${input.validFrom}T00:00:00Z`)
    priorDay.setUTCDate(priorDay.getUTCDate() - 1)
    const closeAt = priorDay.toISOString().slice(0, 10)
    await db.execute(
      sql`UPDATE organization_tax_profile SET valid_to = ${closeAt}::date
          WHERE organization_id = ${ctx.organizationId}::uuid AND valid_to IS NULL`,
    )
    const orgCtx: OrgCtx = {
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
    }
    await createTaxProfile(db, orgCtx, {
      hasStandardEmployment: input.hasStandardEmployment,
      hasDpp: input.hasDpp,
      hasDpc: input.hasDpc,
      socialInsuranceParticipation: input.socialInsuranceParticipation,
      healthInsuranceParticipation: input.healthInsuranceParticipation,
      payrollTaxAdvanceDue: input.payrollTaxAdvanceDue,
      specialRateWithholdingDue: input.specialRateWithholdingDue,
      validFrom: input.validFrom,
    })
  })
}

/** Add an OSS registration (UNION | IMPORT). The gist EXCLUDE bars overlaps. */
export async function addOssRegistration(
  ctx: OrgContext,
  userId: string,
  input: { scheme: string; validFrom: string },
): Promise<void> {
  await withOrganization(ctx.organizationId, userId, async (db) => {
    await db.execute(
      sql`INSERT INTO organization_oss_registration (organization_id, scheme, valid_from)
          VALUES (${ctx.organizationId}::uuid, ${input.scheme}, ${input.validFrom}::date)`,
    )
  })
}

/** Close an open OSS registration by setting its valid_to. */
export async function closeOssRegistration(
  ctx: OrgContext,
  userId: string,
  input: { id: string; validTo: string },
): Promise<void> {
  await withOrganization(ctx.organizationId, userId, async (db) => {
    await db.execute(
      sql`UPDATE organization_oss_registration SET valid_to = ${input.validTo}::date
          WHERE id = ${input.id}::uuid AND organization_id = ${ctx.organizationId}::uuid
            AND valid_to IS NULL`,
    )
  })
}

export interface TaxRepresentativeInput {
  representativeType: string | null
  legalName: string | null
  givenName: string | null
  familyName: string | null
  ico: string | null
  dic: string | null
  advisorRegistrationNumber: string | null
}

/**
 * Upsert the org's (single, primary) tax representative. There is at most one
 * primary row per org (partial-unique index); update it when present, else
 * insert a new primary one.
 */
export async function saveTaxRepresentative(
  ctx: OrgContext,
  userId: string,
  input: TaxRepresentativeInput,
): Promise<void> {
  await withOrganization(ctx.organizationId, userId, async (db) => {
    const [existing] = await executeRows<{ id: string }>(
      db,
      sql`SELECT id FROM organization_tax_representative
          WHERE organization_id = ${ctx.organizationId}::uuid
          ORDER BY is_primary DESC LIMIT 1`,
    )
    if (existing) {
      await db.execute(
        sql`UPDATE organization_tax_representative SET
              representative_type = ${input.representativeType},
              legal_name = ${input.legalName},
              given_name = ${input.givenName},
              family_name = ${input.familyName},
              ico = ${input.ico},
              dic = ${input.dic},
              advisor_registration_number = ${input.advisorRegistrationNumber},
              updated_at = now()
            WHERE id = ${existing.id}::uuid
              AND organization_id = ${ctx.organizationId}::uuid`,
      )
    } else {
      await db.execute(
        sql`INSERT INTO organization_tax_representative
              (organization_id, representative_type, legal_name, given_name, family_name,
               ico, dic, advisor_registration_number, is_primary)
            VALUES (${ctx.organizationId}::uuid, ${input.representativeType}, ${input.legalName},
                    ${input.givenName}, ${input.familyName}, ${input.ico}, ${input.dic},
                    ${input.advisorRegistrationNumber}, true)`,
      )
    }
  })
}

/** Close the given period + open the next one (one org-bound transaction). */
export async function rollForwardOrgPeriod(
  ctx: OrgContext,
  userId: string,
  periodId: string,
): Promise<{ newPeriodId: string }> {
  return await withOrganization(ctx.organizationId, userId, async (db) => {
    const [prior] = await executeRows<{ period_end: string }>(
      db,
      sql`SELECT period_end::text FROM accounting_period
            WHERE id = ${periodId}::uuid AND organization_id = ${ctx.organizationId}::uuid
              AND status = 'OPEN'`,
    )
    if (!prior) throw new Error("open period not found")
    const [ev] = await executeRows<{ id: string }>(
      db,
      sql`SELECT id FROM number_series
            WHERE organization_id = ${ctx.organizationId}::uuid AND entity_type = 'EVENT'
            ORDER BY created_at LIMIT 1`,
    )
    const [doc] = await executeRows<{ id: string }>(
      db,
      sql`SELECT id FROM number_series
            WHERE organization_id = ${ctx.organizationId}::uuid AND entity_type = 'DOCUMENT'
            ORDER BY (code = 'ID') DESC, created_at LIMIT 1`,
    )
    if (!ev || !doc) throw new Error("number series missing")

    const bounds = nextBounds(prior.period_end)
    const orgCtx: OrgCtx = {
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
    }
    const res = await rollForwardPeriod(db, orgCtx, {
      priorPeriodId: periodId,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      eventSeriesId: ev.id,
      documentSeriesId: doc.id,
      responsibleUserId: userId,
    })
    return { newPeriodId: res.newPeriodId }
  })
}

export interface NumberSeriesRow {
  id: string
  entityType: string
  code: string
  pattern: string
  nextNumber: number
}

/** The number_series list for the Number series settings page. */
export async function loadNumberSeries(
  ctx: OrgContext,
  userId: string,
): Promise<NumberSeriesRow[]> {
  return await withOrganization(ctx.organizationId, userId, async (db) => {
    const series = await executeRows<{
      id: string
      entity_type: string
      code: string
      pattern: string
      next_number: number
    }>(
      db,
      sql`SELECT id, entity_type, code, pattern, next_number::int
          FROM number_series WHERE organization_id = ${ctx.organizationId}::uuid
          ORDER BY entity_type, code`,
    )
    return series.map((s) => ({
      id: s.id,
      entityType: s.entity_type,
      code: s.code,
      pattern: s.pattern,
      nextNumber: s.next_number,
    }))
  })
}

/**
 * Restore any missing default číselné řady for the org. Conservative:
 * existing series (and their next_number) are never touched — only the
 * defaults the org doesn't already have get added. Returns the count inserted.
 */
export async function backfillOrgNumberSeries(
  ctx: OrgContext,
  userId: string,
): Promise<number> {
  return await withOrganization(ctx.organizationId, userId, (db) => {
    const orgCtx: OrgCtx = {
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
    }
    return backfillDefaultNumberSeries(db, orgCtx)
  })
}
