/**
 * Locale registry.
 *
 * To add a new locale:
 *   1. Add the BCP-47 code to `locales` below
 *   2. Drop a matching `messages/<code>.json` file (copy en.json, translate values)
 *   3. Optionally extend `localeLabel` for the LocaleSwitcher UI
 *
 * No code changes elsewhere.
 */
export const locales = ["en"] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "en"

/**
 * Human-readable label per locale, used by the LocaleSwitcher dropdown.
 * Keep the label in the locale's own language (English, Čeština, Українська).
 */
export const localeLabel: Record<Locale, string> = {
  en: "English",
}

export function isLocale(value: string | undefined | null): value is Locale {
  return (
    typeof value === "string" && (locales as readonly string[]).includes(value)
  )
}

/**
 * Cookie name the client uses to persist the active locale. The runtime
 * resolution chain inside `request.ts` reads this cookie BEFORE falling
 * back to `app_user.locale` from the session, so a logged-in user
 * switching locale in the LocaleSwitcher takes effect immediately
 * without a DB round-trip.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE"
