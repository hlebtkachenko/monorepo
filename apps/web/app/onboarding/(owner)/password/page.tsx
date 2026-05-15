import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { getTranslations } from "@workspace/i18n/server"

import { WizardProgress } from "../../_components/wizard-progress"
import { readSignupClaims } from "../../_lib/signup-cookie"
import { readOnboardingState } from "../../_lib/state-cookie"
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
  const tCommon = await getTranslations("common")
  return (
    <div className="flex flex-col gap-8">
      <WizardProgress current={3} total={7} />
      <Link
        href="/onboarding/experience"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {tCommon("back")}
      </Link>
      <PasswordForm email={claims.email} />
    </div>
  )
}
