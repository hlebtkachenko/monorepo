import { cookies } from "next/headers"
import { getRequestConfig as createRequestConfig } from "next-intl/server"
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config"

/**
 * Build a next-intl `getRequestConfig` handler from a locale resolver.
 *
 * Resolution order applied here:
 *   1. NEXT_LOCALE cookie (LocaleSwitcher writes it, fastest)
 *   2. Caller-supplied `resolveUserLocale()` (typically reads
 *      `app_user.locale` from the Better Auth session)
 *   3. `defaultLocale`
 *
 * Callers do not need to deal with cookies or fallbacks themselves —
 * pass an async function returning the user's preferred locale or null.
 * The i18n package stays auth-agnostic; the consuming app supplies the
 * session→locale lookup.
 */
export interface BuildRequestConfigInput {
  resolveUserLocale?: () => Promise<string | null | undefined>
}

export function buildRequestConfig(input: BuildRequestConfigInput = {}) {
  return createRequestConfig(async () => {
    const locale = await resolveLocale(input.resolveUserLocale)
    const messages = (await import(`./messages/${locale}.json`)).default
    return { locale, messages }
  })
}

async function resolveLocale(
  resolveUserLocale?: BuildRequestConfigInput["resolveUserLocale"],
): Promise<Locale> {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value
  if (isLocale(fromCookie)) {
    return fromCookie
  }
  if (resolveUserLocale) {
    const fromUser = await resolveUserLocale()
    if (isLocale(fromUser)) {
      return fromUser
    }
  }
  return defaultLocale
}
