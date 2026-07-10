"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@workspace/auth/server"
import { withOrganization } from "@workspace/db"
import { saveDppoAdjustments, type OrgCtx } from "@workspace/accounting"

import {
  resolveOrgContext,
  type OrgContext,
} from "../../settings/_lib/settings-data"
import { getOrgAccountingContext } from "../../_lib/accounting-data"
import {
  DppoAdjustmentInputSchema,
  toDppoSaveInput,
  type DppoAdjustmentInput,
} from "./_lib/dppo-adjustment-form"

export interface IncomeTaxActionResult {
  ok: boolean
  errorKey?: string
}

/**
 * Owner/admin gate — the same role check settings/actions.ts `authorize()`
 * enforces before any org mutation. Resolves the session, then the caller's
 * org membership role.
 */
async function authorize(
  slug: string,
): Promise<{ userId: string; ctx: OrgContext } | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) return null
  const ctx = await resolveOrgContext(slug, userId)
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "admin")) return null
  return { userId, ctx }
}

/**
 * Persist the provenanced DPPO worksheet inputs for the active accounting
 * period. The period is resolved SERVER-SIDE (from the active-period cookie),
 * never accepted from the client, and organization/workspace tenancy is
 * injected from the session — the Zod input schema carries none of it. buildDppo
 * reads the saved row on the next render (see income-tax-data.ts).
 */
export async function saveDppoAdjustmentsAction(
  slug: string,
  input: DppoAdjustmentInput,
): Promise<IncomeTaxActionResult> {
  const gate = await authorize(slug)
  if (!gate) return { ok: false, errorKey: "forbidden" }

  const parsed = DppoAdjustmentInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errorKey: "invalidInput" }

  const accountingContext = await getOrgAccountingContext(slug)
  const periodId = accountingContext?.periodId
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
