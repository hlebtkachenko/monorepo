import { redirect } from "next/navigation"
import { getTranslations } from "@workspace/i18n/server"

import { readOnboardingState } from "../../_lib/state-cookie"
import { readInviteClaims } from "../_lib/invite-cookie"
import { MemberOnboardingShell } from "../_components/member-shell"
import { MemberPasswordForm } from "./member-password-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.password")
  return { title: t("metaTitle") }
}

export default async function MemberPasswordPage() {
  const claims = await readInviteClaims()
  if (!claims) {
    redirect("/auth/login?error=invite-session-expired")
  }
  const state = await readOnboardingState()
  if (!state.profile) redirect("/onboarding/member/profile")
  if (!state.experience) redirect("/onboarding/member/experience")
  return (
    <MemberOnboardingShell
      step="password"
      backHref="/onboarding/member/experience"
    >
      <MemberPasswordForm email={claims.email} />
    </MemberOnboardingShell>
  )
}
