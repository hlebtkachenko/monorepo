import { AuditReports } from "../../../_components/workspace/audit/audit-reports"

export const metadata = { title: "Audit · Reports" }

/**
 * Audit → Reports. A thin server page rendering the shell-integrated
 * `<AuditReports />` — delivered documents + archive with a preview inspector.
 * Entirely MOCK, so there is nothing to resolve server-side.
 */
export default function WorkspaceAuditReportsPage() {
  return <AuditReports />
}
