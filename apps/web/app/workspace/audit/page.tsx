import { AuditOverview } from "../../_components/workspace/audit/audit-overview"

export const metadata = { title: "Audit" }

/**
 * Audit → Overview. A thin server page: it renders the shell-integrated
 * `<AuditOverview />` (a `"use client"` component that portals its title into
 * the shell header via `AppPageHeader` and shows the KPI row + action list in a
 * `ContentPanel`). Entirely MOCK — no audit tables back this surface yet — so
 * there is nothing to resolve server-side.
 */
export default function WorkspaceAuditPage() {
  return <AuditOverview />
}
