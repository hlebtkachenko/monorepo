import { InvitesClient } from "./invites-client"

export const metadata = { title: "Invites & tokens" }

export default function InvitesPage() {
  // Render access is enforced by `invites/layout.tsx` (<SectionGate path="/invites">,
  // = owner/admin/support). The mint actions carry their own capability + step-up
  // gates. This is the canonical (post-#405, only) prod account-creation surface.
  return <InvitesClient />
}
