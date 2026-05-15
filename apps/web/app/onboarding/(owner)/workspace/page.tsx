import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import { getTranslations } from "@workspace/i18n/server"

import { WizardProgress } from "../../_components/wizard-progress"
import { assertOwnerOnStep } from "../../_lib/resume"
import { WorkspaceForm } from "./workspace-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.workspace")
  return { title: t("metaTitle") }
}

export default async function WorkspacePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    redirect("/onboarding/password")
  }
  await assertOwnerOnStep(session.user.id, "workspace")
  return (
    <div className="flex flex-col gap-8">
      <WizardProgress current={4} total={7} />
      <WorkspaceForm />
    </div>
  )
}
