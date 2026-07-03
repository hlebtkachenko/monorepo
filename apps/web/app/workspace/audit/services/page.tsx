import { AuditServices } from "../../../_components/workspace/audit/audit-services"

export const metadata = { title: "Audit · Services" }

/**
 * Audit → Services. A thin server page rendering the shell-integrated
 * `<AuditServices />` — the orderable service catalog plus the order-flow
 * dialog. Entirely MOCK, so there is nothing to resolve server-side.
 */
export default function WorkspaceAuditServicesPage() {
  return <AuditServices />
}
