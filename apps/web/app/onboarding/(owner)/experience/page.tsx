import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { getTranslations } from "@workspace/i18n/server"

import { WizardProgress } from "../../_components/wizard-progress"
import { readOnboardingState } from "../../_lib/state-cookie"
import { ExperienceForm } from "./experience-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.experience")
  return { title: t("metaTitle") }
}

export default async function ExperiencePage() {
  const state = await readOnboardingState()
  const tCommon = await getTranslations("common")
  return (
    <div className="flex flex-col gap-8">
      <WizardProgress current={2} total={7} />
      <Link
        href="/onboarding/profile"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {tCommon("back")}
      </Link>
      <ExperienceForm initial={state.experience} />
    </div>
  )
}
