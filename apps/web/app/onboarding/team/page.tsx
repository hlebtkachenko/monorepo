import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import { getTranslations } from "@workspace/i18n/server"

import { OnboardingShell } from "../_components/onboarding-shell"
import { TeamForm } from "./team-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.team")
  return { title: t("metaTitle") }
}

export default async function TeamPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    redirect("/onboarding/password")
  }
  return (
    <OnboardingShell step="team" backHref="/onboarding/plan">
      <TeamForm />
    </OnboardingShell>
  )
}
