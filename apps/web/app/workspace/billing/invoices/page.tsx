import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"

import { BillingInvoicesTable } from "../../../_components/workspace/billing/billing-invoices-table"
import { getWorkspaceContext } from "../../_lib/workspace-context"

export const metadata = { title: "Workspace billing — Invoices" }

/**
 * Billing invoices — the full (mock) invoice history. No real data source yet
 * (see `billing-invoices-table.tsx` / `data.ts`).
 */
export default async function WorkspaceBillingInvoicesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) redirect("/workspace")

  return <BillingInvoicesTable />
}
