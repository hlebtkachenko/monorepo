import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import { getTranslations } from "@workspace/i18n/server"

import { OnboardingShell } from "../_components/onboarding-shell"
import { assertOwnerOnStep } from "../_lib/resume"
import { completeOnboardingAction } from "../actions"
import { DoneCard } from "./done-card"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.done")
  return { title: t("metaTitle") }
}

export default async function DonePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    redirect("/onboarding/password")
  }
  // Auto-run the completion-marker write so closing the tab before
  // clicking "Open Afframe" still finalizes onboarding (MED-3 in
  // PHASE_REVIEW.md). The action is idempotent — calling it on a
  // workspace that already has onboarding_completed_at set just bumps
  // updated_at with the same timestamps.
  await completeOnboardingAction()

  // Allow landing on /done even after onboarding completion (don't
  // redirect to /workspace via assertOwnerOnStep) — the page renders the
  // success card; the "Open Afframe" button does the navigation.
  await assertOwnerOnStep(session.user.id, "done", { allowOnDone: true })
  return (
    <OnboardingShell step="done">
      <DoneCard />
    </OnboardingShell>
  )
}
