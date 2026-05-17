import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import { getTranslations } from "@workspace/i18n/server"

import { isDevPreview } from "@/lib/dev-preview"

import { assertOnStep } from "../_lib/resume"
import { detectOnboardingRole } from "../_lib/role"
import { WorkspaceForm } from "./workspace-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.workspace")
  return { title: t("metaTitle") }
}

export default async function WorkspacePage() {
  const ctx = await detectOnboardingRole()
  if (!ctx) redirect("/auth/login?error=onboarding-session-expired")

  // Dev-preview renders the screen for design inspection without a
  // session or persisted step state.
  if (await isDevPreview()) {
    return <WorkspaceForm />
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    redirect("/onboarding/password")
  }

  // assertOnStep redirects members away (workspace isn't in their flow).
  await assertOnStep(session.user.id, ctx.role, "workspace")

  return <WorkspaceForm />
}
