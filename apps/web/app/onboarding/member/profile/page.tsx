import { redirect } from "next/navigation"
import { getTranslations } from "@workspace/i18n/server"

import { readOnboardingState } from "../../_lib/state-cookie"
import { readInviteClaims } from "../_lib/invite-cookie"
import { MemberOnboardingShell } from "../_components/member-shell"
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
    <MemberOnboardingShell step="profile">
      <MemberProfileForm initial={state.profile} />
    </MemberOnboardingShell>
  )
}
