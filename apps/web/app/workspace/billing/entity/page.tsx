import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { workspace_billing } from "@workspace/db/schema"

import { BillingEntityForm } from "../../../_components/workspace/billing/billing-entity-form"
import { getWorkspaceContext } from "../../_lib/workspace-context"

export const metadata = { title: "Workspace billing — Billing entity" }

/**
 * Billing entity — real billing entity (`workspace_billing`, which may not
 * exist yet → empty defaults). Reads via `withAdminBypass` + explicit id
 * predicate, consistent with the tier.
 */
export default async function WorkspaceBillingEntityPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) redirect("/workspace")

  const activeWorkspaceId = ctx.activeWorkspaceId
  const billing = await withAdminBypass(async (db) => {
    const [bill] = await db
      .select({
        legalName: workspace_billing.legal_name,
        taxId: workspace_billing.tax_id,
        vatId: workspace_billing.vat_id,
        addressStreet: workspace_billing.address_street,
        addressCity: workspace_billing.address_city,
        addressZip: workspace_billing.address_zip,
        country: workspace_billing.country,
        billingEmail: workspace_billing.billing_email,
      })
      .from(workspace_billing)
      .where(eq(workspace_billing.workspace_id, activeWorkspaceId))
      .limit(1)
    return bill ?? null
  })

  return (
    <BillingEntityForm
      entity={{
        legalName: billing?.legalName ?? "",
        taxId: billing?.taxId ?? "",
        vatId: billing?.vatId ?? "",
        addressStreet: billing?.addressStreet ?? "",
        addressCity: billing?.addressCity ?? "",
        addressZip: billing?.addressZip ?? "",
        country: billing?.country ?? "",
        billingEmail: billing?.billingEmail ?? "",
      }}
    />
  )
}
