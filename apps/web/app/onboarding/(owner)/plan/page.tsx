import Link from "next/link"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { ChevronLeft } from "lucide-react"
import { auth } from "@workspace/auth/server"
import { getTranslations } from "@workspace/i18n/server"

import { WizardProgress } from "../../_components/wizard-progress"
import { assertOwnerOnStep } from "../../_lib/resume"
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
  const tCommon = await getTranslations("common")
  return (
    <div className="flex flex-col gap-8">
      <WizardProgress current={5} total={7} />
      <Link
        href="/onboarding/workspace"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {tCommon("back")}
      </Link>
      <PlanForm />
    </div>
  )
}
