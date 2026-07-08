import "server-only"

import { sql, executeRows, withOrganization } from "@workspace/db"
import {
  buildDppo,
  buildDpfo,
  type Dppo,
  type Dpfo,
  type PersonType,
} from "@workspace/accounting"

import { getOrgAccountingContext } from "../../../_lib/accounting-data"
import { formatIsoDate } from "../../_lib/closing-shared"

/**
 * Server-side data for the Closing Income tax pages (Corporation tax / DPPO,
 * Personal income tax / DPFO). Unlike VAT these are ANNUAL — one computation
 * per accounting period, no filing-period picker.
 *
 * Resolves the org's active period + `organization.person_type`, then gates
 * each tax by the statutory person type: DPPO (daň z příjmů právnických
 * osob, Act 586/1992 Sb.) applies only to a LEGAL organization; DPFO (daň z
 * příjmů fyzických osob) only to a NATURAL one. The non-matching tax reports
 * an honest "not-applicable" state instead of a fabricated computation.
 */

export type IncomeTaxBaseStatus =
  { status: "no-access" } | { status: "no-period" }

export type CorporateIncomeTaxResult =
  | IncomeTaxBaseStatus
  | { status: "not-applicable"; reason: string }
  | { status: "ok"; periodLabel: string; dppo: Dppo }

export type PersonalIncomeTaxResult =
  | IncomeTaxBaseStatus
  | { status: "not-applicable"; reason: string }
  | { status: "ok"; periodLabel: string; dpfo: Dpfo }

export type IncomeTaxLandingResult =
  IncomeTaxBaseStatus | { status: "ok"; personType: PersonType }

interface ResolvedIncomeTaxContext {
  organizationId: string
  userId: string
  periodId: string
  periodLabel: string
  personType: PersonType
}

type IncomeTaxContextResolution =
  IncomeTaxBaseStatus | ({ status: "ok" } & ResolvedIncomeTaxContext)

/**
 * Resolve the org + active period + `organization.person_type` — the same
 * period-scoped context shape `resolveVatContext` (vat-data.ts) builds,
 * minus the VAT-specific regime read.
 */
async function resolveIncomeTaxContext(
  orgSlug: string,
): Promise<IncomeTaxContextResolution> {
  const ctx = await getOrgAccountingContext(orgSlug)
  if (!ctx) return { status: "no-access" }
  if (
    ctx.periodId == null ||
    ctx.periodStart == null ||
    ctx.periodEnd == null
  ) {
    return { status: "no-period" }
  }
  const periodId = ctx.periodId
  const periodLabel = `${formatIsoDate(ctx.periodStart)} – ${formatIsoDate(ctx.periodEnd)}`

  const personType = await withOrganization(
    ctx.organizationId,
    ctx.userId,
    async (db) => {
      const [org] = await executeRows<{ person_type: string }>(
        db,
        sql`SELECT person_type FROM organization WHERE id = ${ctx.organizationId}::uuid`,
      )
      return (org?.person_type ?? "LEGAL") as PersonType
    },
  )

  return {
    status: "ok",
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    periodId,
    periodLabel,
    personType,
  }
}

const DPPO_NOT_APPLICABLE_REASON =
  "This company is a natural person; corporate income tax (DPPO) does not apply — see Personal income tax."
const DPFO_NOT_APPLICABLE_REASON =
  "This company is a legal entity; personal income tax (DPFO) does not apply — see Corporation tax."

/** Corporation tax (DPPO) — the active period's real figures from `buildDppo`. LEGAL organizations only. */
export async function getCorporateIncomeTax(
  orgSlug: string,
): Promise<CorporateIncomeTaxResult> {
  const resolved = await resolveIncomeTaxContext(orgSlug)
  if (resolved.status !== "ok") return resolved
  if (resolved.personType !== "LEGAL") {
    return { status: "not-applicable", reason: DPPO_NOT_APPLICABLE_REASON }
  }
  const dppo = await withOrganization(
    resolved.organizationId,
    resolved.userId,
    (db) => buildDppo(db, resolved.periodId),
  )
  return { status: "ok", periodLabel: resolved.periodLabel, dppo }
}

/** Personal income tax (DPFO) — the active period's real figures from `buildDpfo`. NATURAL organizations only. */
export async function getPersonalIncomeTax(
  orgSlug: string,
): Promise<PersonalIncomeTaxResult> {
  const resolved = await resolveIncomeTaxContext(orgSlug)
  if (resolved.status !== "ok") return resolved
  if (resolved.personType !== "NATURAL") {
    return { status: "not-applicable", reason: DPFO_NOT_APPLICABLE_REASON }
  }
  const dpfo = await withOrganization(
    resolved.organizationId,
    resolved.userId,
    (db) => buildDpfo(db, resolved.periodId),
  )
  return { status: "ok", periodLabel: resolved.periodLabel, dpfo }
}

/** Income tax landing summary — just the person type, to pick which of DPPO/DPFO to link to. */
export async function getIncomeTaxLanding(
  orgSlug: string,
): Promise<IncomeTaxLandingResult> {
  const resolved = await resolveIncomeTaxContext(orgSlug)
  if (resolved.status !== "ok") return resolved
  return { status: "ok", personType: resolved.personType }
}
