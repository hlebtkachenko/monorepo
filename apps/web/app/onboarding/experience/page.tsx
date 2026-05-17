import { getTranslations } from "@workspace/i18n/server"

import { readOnboardingState } from "../_lib/state-cookie"
import { ExperienceForm } from "./experience-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.experience")
  return { title: t("metaTitle") }
}

export default async function ExperiencePage() {
  const state = await readOnboardingState()
  return <ExperienceForm initial={state.experience} />
}
