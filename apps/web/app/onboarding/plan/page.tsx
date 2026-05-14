import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import { getTranslations } from "@workspace/i18n/server"

import { OnboardingShell } from "../_components/onboarding-shell"
import { assertOwnerOnStep } from "../_lib/resume"
import { PlanForm } from "./plan-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.plan")
  return { title: t("metaTitle") }
}

export default async function PlanPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    redirect("/onboarding/password")
  }
  await assertOwnerOnStep(session.user.id, "plan")
  return (
    <OnboardingShell step="plan" backHref="/onboarding/workspace">
      <PlanForm />
    </OnboardingShell>
  )
}
