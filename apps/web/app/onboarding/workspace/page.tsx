import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import { getTranslations } from "@workspace/i18n/server"

import { OnboardingShell } from "../_components/onboarding-shell"
import { WorkspaceForm } from "./workspace-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.workspace")
  return { title: t("metaTitle") }
}

export default async function WorkspacePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    redirect("/onboarding/password")
  }
  return (
    <OnboardingShell step="workspace">
      <WorkspaceForm />
    </OnboardingShell>
  )
}
