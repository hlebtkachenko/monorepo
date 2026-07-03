"use server"

import { headers } from "next/headers"
import { z } from "zod"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { workspace_billing } from "@workspace/db/schema"

import { logServerError } from "../../../lib/log-server-error"
import { getWorkspaceContext } from "../_lib/workspace-context"

export interface ActionResult {
  ok: boolean
  errorKey?: string
}

const BillingEntitySchema = z.object({
  legalName: z
    .string()
    .min(1, { error: "legalName.required" })
    .max(200, { error: "legalName.tooLong" })
    .trim(),
  taxId: z.string().max(50, { error: "taxId.tooLong" }),
  vatId: z.string().max(50, { error: "vatId.tooLong" }),
  addressStreet: z
    .string()
    .min(1, { error: "addressStreet.required" })
    .max(200, { error: "addressStreet.tooLong" })
    .trim(),
  addressCity: z
    .string()
    .min(1, { error: "addressCity.required" })
    .max(100, { error: "addressCity.tooLong" })
    .trim(),
  addressZip: z
    .string()
    .min(1, { error: "addressZip.required" })
    .max(20, { error: "addressZip.tooLong" })
    .trim(),
  // Mirrors the DB CHECK (country ~ '^[A-Z]{2}$') on workspace_billing.
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, { error: "country.format" }),
  billingEmail: z
    .string()
    .max(320, { error: "billingEmail.tooLong" })
    .email({ error: "billingEmail.invalid" })
    .or(z.literal("")),
})
export type BillingEntityInput = z.infer<typeof BillingEntitySchema>

/**
 * Save the workspace billing entity — upserts `workspace_billing` (the row
 * may not exist yet), keyed on the server-resolved active workspace id, never
 * a client-supplied one. `withAdminBypass` + explicit predicate, same trap as
 * every other workspace-tier write in this tier.
 */
export async function saveBillingEntityAction(
  input: BillingEntityInput,
): Promise<ActionResult> {
  const parsed = BillingEntitySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: "invalidInput" }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, errorKey: "sessionExpired" }

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) {
    return { ok: false, errorKey: "noActiveWorkspace" }
  }
  const workspaceId = ctx.activeWorkspaceId

  try {
    await withAdminBypass(async (db) => {
      const values = {
        legal_name: parsed.data.legalName,
        tax_id: parsed.data.taxId || null,
        vat_id: parsed.data.vatId || null,
        address_street: parsed.data.addressStreet,
        address_city: parsed.data.addressCity,
        address_zip: parsed.data.addressZip,
        country: parsed.data.country,
        billing_email: parsed.data.billingEmail || null,
        updated_at: new Date(),
      }
      await db
        .insert(workspace_billing)
        .values({ workspace_id: workspaceId, ...values })
        .onConflictDoUpdate({
          target: workspace_billing.workspace_id,
          set: values,
        })
    })
  } catch (err) {
    logServerError("workspace/billing entity save failed", err)
    return { ok: false, errorKey: "saveBillingEntityFailed" }
  }

  return { ok: true }
}
