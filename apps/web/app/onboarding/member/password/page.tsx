import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { getTranslations } from "@workspace/i18n/server"

import { WizardProgress } from "../../_components/wizard-progress"
import { readOnboardingState } from "../../_lib/state-cookie"
import { readInviteClaims } from "../_lib/invite-cookie"
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
  const tCommon = await getTranslations("common")
  return (
    <div className="flex flex-col gap-8">
      <WizardProgress current={3} total={4} />
      <Link
        href="/onboarding/member/experience"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {tCommon("back")}
      </Link>
      <MemberPasswordForm email={claims.email} />
    </div>
  )
}
