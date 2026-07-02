import { AuditView } from "../../_components/workspace/audit/audit-view"

export const metadata = { title: "Audit" }

/**
 * Audit — the workspace-tier hub for Afframe's paid accounting-audit add-on
 * services. A thin server page: it renders the shell-integrated `<AuditView />`
 * (a `"use client"` component that portals its title/tabs into the shell header
 * via `AppPageHeader` and switches a `ContentPanel` across Services /
 * Engagements / Messages / Reports). Entirely MOCK — no audit tables back this
 * surface yet — so there is nothing to resolve server-side.
 */
export default function WorkspaceAuditPage() {
  return <AuditView />
}
