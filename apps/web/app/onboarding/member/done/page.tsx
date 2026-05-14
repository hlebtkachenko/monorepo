import { getTranslations } from "@workspace/i18n/server"

import { WizardProgress } from "../../_components/wizard-progress"
import { MemberDoneCard } from "./member-done-card"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.done")
  return { title: t("metaTitle") }
}

export default async function MemberDonePage() {
  return (
    <div className="flex flex-col gap-8">
      <WizardProgress current={4} total={4} />
      <MemberDoneCard />
    </div>
  )
}
