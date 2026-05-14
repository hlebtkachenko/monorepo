import { redirect } from "next/navigation"
import { getTranslations } from "@workspace/i18n/server"

import { readOnboardingState } from "../../_lib/state-cookie"
import { readInviteClaims } from "../_lib/invite-cookie"
import { MemberOnboardingShell } from "../_components/member-shell"
import { MemberExperienceForm } from "./member-experience-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.experience")
  return { title: t("metaTitle") }
}

export default async function MemberExperiencePage() {
  const claims = await readInviteClaims()
  if (!claims) {
    redirect("/auth/login?error=invite-session-expired")
  }
  const state = await readOnboardingState()
  if (!state.profile) redirect("/onboarding/member/profile")
  return (
    <MemberOnboardingShell
      step="experience"
      backHref="/onboarding/member/profile"
    >
      <MemberExperienceForm initial={state.experience} />
    </MemberOnboardingShell>
  )
}
