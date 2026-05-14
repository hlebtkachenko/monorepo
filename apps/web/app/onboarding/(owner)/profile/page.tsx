import { getTranslations } from "@workspace/i18n/server"

import { WizardProgress } from "../../_components/wizard-progress"
import { readOnboardingState } from "../../_lib/state-cookie"
import { ProfileForm } from "./profile-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.profile")
  return { title: t("metaTitle") }
}

export default async function ProfilePage() {
  const state = await readOnboardingState()
  return (
    <div className="flex flex-col gap-8">
      <WizardProgress current={1} total={7} />
      <ProfileForm initial={state.profile} />
    </div>
  )
}
