import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { workspace } from "@workspace/db/schema"
import { getTranslations } from "@workspace/i18n/server"

import { WizardProgress } from "../../_components/wizard-progress"
import { findOwnerWorkspaceId, assertOwnerOnStep } from "../../_lib/resume"
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

  // Idempotent completion-marker write so closing the tab before
  // clicking "Open Afframe" still finalizes onboarding (MED-3 in
  // PHASE_REVIEW.md). Only writes to the workspace row — does NOT
  // touch cookies. Cookies are cleared by `completeOnboardingAction`
  // when the user clicks the button (which runs in a server-action
  // context where cookies are writable). Server Components like this
  // page cannot write cookies.
  const workspaceId = await findOwnerWorkspaceId(session.user.id)
  if (workspaceId) {
    await withAdminBypass(async (db) => {
      const now = new Date()
      await db
        .update(workspace)
        .set({
          step_4_completed_at: now,
          onboarding_completed_at: now,
          updated_at: now,
        })
        .where(eq(workspace.id, workspaceId))
    })
  }

  // Allow landing on /done even after onboarding completion (don't
  // redirect to /workspace via assertOwnerOnStep) — the page renders
  // the success card; the "Open Afframe" button does the navigation
  // and clears the signup cookie.
  await assertOwnerOnStep(session.user.id, "done", { allowOnDone: true })
  return (
    <div className="flex flex-col gap-8">
      <WizardProgress current={7} total={7} />
      <DoneCard />
    </div>
  )
}
