import { redirect } from "next/navigation"
import { getTranslations } from "@workspace/i18n/server"

import { OnboardingShell } from "../_components/onboarding-shell"
import { readSignupClaims } from "../_lib/signup-cookie"
import { readOnboardingState } from "../_lib/state-cookie"
import { PasswordForm } from "./password-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.password")
  return { title: t("metaTitle") }
}

export default async function PasswordPage() {
  const claims = await readSignupClaims()
  if (!claims) {
    redirect("/auth/login?error=signup-session-expired")
  }
  const state = await readOnboardingState()
  if (!state.profile) redirect("/onboarding/profile")
  if (!state.experience) redirect("/onboarding/experience")
  return (
    <OnboardingShell step="password" backHref="/onboarding/experience">
      <PasswordForm email={claims.email} />
    </OnboardingShell>
  )
}
