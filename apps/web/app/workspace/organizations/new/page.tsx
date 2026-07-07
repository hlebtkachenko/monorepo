import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"
import { getTranslations } from "@workspace/i18n/server"

import { getWorkspaceContext } from "../../_lib/workspace-context"
import { CreateOrgWizard } from "./create-org-wizard"

export async function generateMetadata() {
  const t = await getTranslations("createOrg")
  return { title: t("metaTitle") }
}

export default async function NewOrganizationPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/auth/login")

  // Org creation is a workspace operation; resolve + guard here so the wizard
  // never renders without a target workspace (same resolver the Companies index
  // and the other workspace pages use).
  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) redirect("/workspace")

  // The app-shell main body is `overflow-hidden` by design (pages own their
  // inner scroll — see AppShell). This wizard is plain flow content, so it needs
  // its own scroll region or it gets clipped with no scrollbar on short viewports.
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <CreateOrgWizard />
      </div>
    </div>
  )
}
