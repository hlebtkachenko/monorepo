import { AuditEngagements } from "../../../_components/workspace/audit/audit-engagements"

export const metadata = { title: "Audit · Engagements" }

/**
 * Audit → Engagements. A thin server page rendering the shell-integrated
 * `<AuditEngagements />` — the engagements table with a status-timeline /
 * documents / findings inspector. Entirely MOCK, so there is nothing to resolve
 * server-side.
 */
export default function WorkspaceAuditEngagementsPage() {
  return <AuditEngagements />
}
