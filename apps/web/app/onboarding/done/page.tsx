import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { workspace } from "@workspace/db/schema"
import { getTranslations } from "@workspace/i18n/server"

import { isDevPreview } from "@/lib/dev-preview"

import { assertOnStep, findOwnerWorkspaceId } from "../_lib/resume"
import { detectOnboardingRole } from "../_lib/role"
import { DoneCard } from "./done-card"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.done")
  return { title: t("metaTitle") }
}

export default async function DonePage() {
  const ctx = await detectOnboardingRole()
  if (!ctx) redirect("/auth/login?error=onboarding-session-expired")

  // Dev-preview renders the success card for design inspection without
  // a session or the completion-marker DB write.
  if (await isDevPreview()) {
    return <DoneCard role={ctx.role} />
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    redirect("/onboarding/password")
  }

  // Owner-only: idempotent completion-marker write so closing the tab
  // before clicking "Open Afframe" still finalizes onboarding. Members
  // have no workspace to flip — the materializeInvite call at step 3
  // already wrote workspace_membership + organization_membership.
  if (ctx.role === "owner") {
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
  }

  // Allow landing on /done even after onboarding completion (don't
  // redirect to /workspace via assertOnStep) — the page renders
  // the success card; the "Open Afframe" button does the navigation
  // and clears the cookies.
  await assertOnStep(session.user.id, ctx.role, "done", { allowOnDone: true })

  return <DoneCard role={ctx.role} />
}
