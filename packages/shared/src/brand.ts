/**
 * Brand identity constants.
 *
 * Display strings live in `@workspace/i18n` messages under the `brand.*`
 * namespace, so they remain translatable. This module exposes only the
 * i18n keys + structural data (such as logo asset path) — never the raw
 * product name. Grep for hardcoded "Afframe" outside `messages/*.json`
 * should return zero matches.
 */
export const BRAND = {
  /** i18n key for the product name (e.g. "Afframe"). */
  nameKey: "brand.name",
  /** i18n key for the marketing tagline used on auth/onboarding asides. */
  taglineKey: "brand.tagline",
  /** Public path to the logo asset. */
  logoPath: "/brand/afframe.svg",
} as const

export type Brand = typeof BRAND
