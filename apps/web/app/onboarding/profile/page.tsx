import { getTranslations } from "@workspace/i18n/server"

import { readOnboardingState } from "../_lib/state-cookie"
import { ProfileForm } from "./profile-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.profile")
  return { title: t("metaTitle") }
}

export default async function ProfilePage() {
  const state = await readOnboardingState()
  return <ProfileForm initial={state.profile} />
}
