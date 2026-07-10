"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { withOrganization } from "@workspace/db"
import { saveDppoAdjustments, type OrgCtx } from "@workspace/accounting"

import { authorizeOrgAdmin } from "../../_lib/org-authz"
import {
  getHeaderPeriods,
  PERIOD_COOKIE,
  resolveActivePeriod,
} from "../../_lib/header-periods"
import {
  DppoAdjustmentInputSchema,
  toDppoSaveInput,
  type DppoAdjustmentInput,
} from "./_lib/dppo-adjustment-form"

export type IncomeTaxActionResult =
  | { ok: true }
  | {
      ok: false
      errorKey: "forbidden" | "invalidInput" | "noPeriod" | "saveFailed"
    }

/**
 * Persist the provenanced DPPO worksheet inputs for the active accounting
 * period. The owner/admin gate (`authorizeOrgAdmin`) already resolved the org,
 * so the active period is read directly (`getHeaderPeriods` + the active-period
 * cookie) without re-resolving session + membership. The period is resolved
 * SERVER-SIDE, never accepted from the client, and organization/workspace
 * tenancy is injected from the resolved context — the Zod input schema carries
 * none of it. buildDppo reads the saved row on the next render (see
 * income-tax-data.ts).
 */
export async function saveDppoAdjustmentsAction(
  slug: string,
  input: DppoAdjustmentInput,
): Promise<IncomeTaxActionResult> {
  const gate = await authorizeOrgAdmin(slug)
  if (!gate) return { ok: false, errorKey: "forbidden" }

  const parsed = DppoAdjustmentInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errorKey: "invalidInput" }

  const periods = await getHeaderPeriods({
    organizationId: gate.ctx.organizationId,
  })
  const cookieStore = await cookies()
  const period = resolveActivePeriod(
    periods,
    cookieStore.get(PERIOD_COOKIE)?.value,
  )
  const periodId = period?.id
  if (!periodId) return { ok: false, errorKey: "noPeriod" }

  const orgCtx: OrgCtx = {
    organizationId: gate.ctx.organizationId,
    workspaceId: gate.ctx.workspaceId,
  }
  try {
    await withOrganization(gate.ctx.organizationId, gate.userId, (db) =>
      saveDppoAdjustments(db, orgCtx, periodId, toDppoSaveInput(parsed.data)),
    )
  } catch {
    return { ok: false, errorKey: "saveFailed" }
  }

  revalidatePath(`/${slug}/closing/income-tax/dppo`)
  return { ok: true }
}
