import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"

/**
 * Settings landing for the rebuilt org tree.
 *
 * Resolves the profile menu's "Settings" link (`orgHref(slug, "settings")`) so
 * it no longer 404s. Intentionally EMPTY — Settings has no dedicated sidebar /
 * nav treatment yet and this tree allows NO demo / placeholder content: the
 * shell renders around an empty content panel until real settings surfaces are
 * designed.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("settings") }
}

export default function OrgSettingsPage() {
  return null
}
