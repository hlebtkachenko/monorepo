import { getTranslations } from "@workspace/i18n/server"

import { OnboardingShell } from "../_components/onboarding-shell"
import { readOnboardingState } from "../_lib/state-cookie"
import { ProfileForm } from "./profile-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.profile")
  return { title: t("metaTitle") }
}

export default async function ProfilePage() {
  const state = await readOnboardingState()
  return (
    <OnboardingShell step="profile">
      <ProfileForm initial={state.profile} />
    </OnboardingShell>
  )
}
