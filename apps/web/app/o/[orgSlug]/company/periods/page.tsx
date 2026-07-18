import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"

/**
 * Company module → Periods.
 *
 * Intentionally EMPTY. The shell + Company nav render around it, but no Periods
 * content is designed yet — and this tree allows NO demo / placeholder content:
 * a page body is either wired to real org data or empty. Real content lands in
 * the execution phase (archetype-driven, wired to org data). Until then the
 * shell renders around an empty content panel.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("periods") }
}

export default function CompanyPeriodsPage() {
  return null
}
