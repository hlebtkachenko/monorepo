"use client"

/**
 * <BrandText /> wrappers — one per brand i18n key.
 *
 * Each reads its matching key from the `brand.*` i18n namespace via
 * next-intl's client hook. Marked "use client" because `useTranslations`
 * is a hook; consumers in either server or client trees can render these
 * (Next.js renders client components server-side then hydrates).
 *
 * For server-only contexts where you can't render a component (Metadata
 * API title/description, server actions, log lines), use `getBrandText()`
 * from "@workspace/ui/brand-assets/text-server".
 */
import { useTranslations } from "@workspace/i18n/client"

type BrandTextKey =
  | "name"
  | "tagline"
  | "shortDescription"
  | "description"
  | "elevatorPitch"
  | "mission"
  | "vision"
  | "valueProp"
  | "legalName"
  | "legalAddress"
  | "mailingAddress"
  | "vatId"
  | "registrationId"
  | "copyrightHolder"
  | "ogTitle"
  | "ogDescription"
  | "metaKeywords"
  | "returnLinkLabel"
  | "returnLinkHref"

function BrandText({ k }: { k: BrandTextKey }) {
  const t = useTranslations("brand")
  return <>{t(k)}</>
}

export function BrandName() {
  return <BrandText k="name" />
}
export function BrandTagline() {
  return <BrandText k="tagline" />
}
export function BrandShortDescription() {
  return <BrandText k="shortDescription" />
}
export function BrandDescription() {
  return <BrandText k="description" />
}
export function BrandElevatorPitch() {
  return <BrandText k="elevatorPitch" />
}
export function BrandMission() {
  return <BrandText k="mission" />
}
export function BrandVision() {
  return <BrandText k="vision" />
}
export function BrandValueProp() {
  return <BrandText k="valueProp" />
}
export function BrandLegalName() {
  return <BrandText k="legalName" />
}
export function BrandLegalAddress() {
  return <BrandText k="legalAddress" />
}
export function BrandMailingAddress() {
  return <BrandText k="mailingAddress" />
}
export function BrandVatId() {
  return <BrandText k="vatId" />
}
export function BrandRegistrationId() {
  return <BrandText k="registrationId" />
}
/**
 * Resolves the brand copyright string with the current year substituted.
 * The i18n value contains `{year}` — never render this component without
 * the substitution, or "© {year} Afframe" leaks to users.
 */
export function BrandCopyrightHolder({ year }: { year?: number } = {}) {
  const t = useTranslations("brand")
  return <>{t("copyrightHolder", { year: year ?? new Date().getFullYear() })}</>
}
export function BrandOgTitle() {
  return <BrandText k="ogTitle" />
}
export function BrandOgDescription() {
  return <BrandText k="ogDescription" />
}
export function BrandMetaKeywords() {
  return <BrandText k="metaKeywords" />
}
export function BrandReturnLinkLabel() {
  return <BrandText k="returnLinkLabel" />
}
export function BrandReturnLinkHref() {
  return <BrandText k="returnLinkHref" />
}
