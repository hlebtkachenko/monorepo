import { redirect } from "next/navigation"
import { getTranslations } from "@workspace/i18n/server"

import { WizardProgress } from "../../_components/wizard-progress"
import { readOnboardingState } from "../../_lib/state-cookie"
import { readInviteClaims } from "../_lib/invite-cookie"
import { MemberProfileForm } from "./member-profile-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.profile")
  return { title: t("metaTitle") }
}

export default async function MemberProfilePage() {
  const claims = await readInviteClaims()
  if (!claims) {
    redirect("/auth/login?error=invite-session-expired")
  }
  const state = await readOnboardingState()
  return (
    <div className="flex flex-col gap-8">
      <WizardProgress current={1} total={4} />
      <MemberProfileForm initial={state.profile} />
    </div>
  )
}
