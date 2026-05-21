/**
 * Server-side brand text resolver.
 *
 * Use in contexts where JSX components don't fit (Metadata API
 * title/description, server actions, log lines, email rendering on the
 * server). Returns resolved strings for the active locale.
 *
 * For client/server JSX, prefer the components in `./text` —
 * <BrandName />, <BrandTagline />, etc.
 */
import { getTranslations } from "@workspace/i18n/server"

export async function getBrandText() {
  const t = await getTranslations("brand")
  return {
    name: t("name"),
    tagline: t("tagline"),
    shortDescription: t("shortDescription"),
    description: t("description"),
    elevatorPitch: t("elevatorPitch"),
    mission: t("mission"),
    vision: t("vision"),
    valueProp: t("valueProp"),
    legalName: t("legalName"),
    legalAddress: t("legalAddress"),
    mailingAddress: t("mailingAddress"),
    vatId: t("vatId"),
    registrationId: t("registrationId"),
    copyrightHolder: t("copyrightHolder"),
    ogTitle: t("ogTitle"),
    ogDescription: t("ogDescription"),
    metaKeywords: t("metaKeywords"),
    returnLinkLabel: t("returnLinkLabel"),
    returnLinkHref: t("returnLinkHref"),
  }
}
