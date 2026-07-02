import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"

import { AnalyseDashboard } from "../../_components/workspace/analyse/analyse-dashboard"
import { getWorkspaceContext } from "../_lib/workspace-context"

export const metadata = { title: "Analyse" }

/**
 * Analyse — the accountant-office overview dashboard (the former Home). Real
 * company count + mock ops KPIs. The zero-workspace case is handled in
 * `layout.tsx`, so `ctx.current` is present here.
 */
export default async function AnalysePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.current) return null

  return (
    <AnalyseDashboard
      workspaceName={ctx.current.name}
      companyCount={ctx.current.companyCount}
    />
  )
}
