import { AuditMessages } from "../../../_components/workspace/audit/audit-messages"

export const metadata = { title: "Audit · Messages" }

/**
 * Audit → Messages. A thin server page rendering the shell-integrated
 * `<AuditMessages />` — the thread with the Afframe audit team plus a working
 * composer. Entirely MOCK, so there is nothing to resolve server-side.
 */
export default function WorkspaceAuditMessagesPage() {
  return <AuditMessages />
}
