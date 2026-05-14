import { getTranslations } from "@workspace/i18n/server"

import { MemberOnboardingShell } from "../_components/member-shell"
import { MemberDoneCard } from "./member-done-card"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.done")
  return { title: t("metaTitle") }
}

export default async function MemberDonePage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug } = await searchParams
  return (
    <MemberOnboardingShell step="done">
      <MemberDoneCard orgSlug={slug ?? ""} />
    </MemberOnboardingShell>
  )
}
