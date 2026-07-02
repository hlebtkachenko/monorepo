import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { workspace } from "@workspace/db/schema"

import { BillingOverview } from "../../_components/workspace/billing/billing-overview"
import { getWorkspaceContext } from "../_lib/workspace-context"

export const metadata = { title: "Workspace billing" }

/**
 * Billing overview — real plan (`workspace.plan`); usage figures and the last
 * invoices are mock (see `BillingOverview` / `data.ts`). Reads via
 * `withAdminBypass` + explicit id predicate, consistent with the tier.
 */
export default async function WorkspaceBillingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) redirect("/workspace")

  const activeWorkspaceId = ctx.activeWorkspaceId
  const plan = await withAdminBypass(async (db) => {
    const [ws] = await db
      .select({ plan: workspace.plan })
      .from(workspace)
      .where(eq(workspace.id, activeWorkspaceId))
      .limit(1)
    return ws?.plan ?? "starter"
  })

  return <BillingOverview plan={plan} />
}
