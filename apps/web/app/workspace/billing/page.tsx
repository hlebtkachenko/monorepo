import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { workspace, workspace_billing } from "@workspace/db/schema"

import { BillingView } from "../../_components/workspace/billing/billing-view"
import { getWorkspaceContext } from "../_lib/workspace-context"

export const metadata = { title: "Workspace billing" }

/**
 * Billing — real plan (`workspace.plan`) + real billing entity
 * (`workspace_billing`, which may not exist yet → empty defaults). Usage figures
 * and invoice history are mock (see `BillingView`). Reads via `withAdminBypass`
 * + explicit id predicate, consistent with the tier.
 */
export default async function WorkspaceBillingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) redirect("/workspace")

  const activeWorkspaceId = ctx.activeWorkspaceId
  const { plan, billing } = await withAdminBypass(async (db) => {
    const [ws] = await db
      .select({ plan: workspace.plan })
      .from(workspace)
      .where(eq(workspace.id, activeWorkspaceId))
      .limit(1)
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
    return { plan: ws?.plan ?? "starter", billing: bill ?? null }
  })

  return (
    <BillingView
      plan={plan}
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
