import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import { buildRequestConfig } from "@workspace/i18n/request"

/**
 * next-intl request config.
 *
 * Locale resolution chain (handled inside buildRequestConfig):
 *   1. NEXT_LOCALE cookie (LocaleSwitcher writes it on user action)
 *   2. `app_user.locale` from the current Better Auth session
 *   3. defaultLocale ("en")
 *
 * Step 2 is the only auth-coupled bit, so we provide it as a callback
 * to keep @workspace/i18n auth-agnostic.
 */
export default buildRequestConfig({
  resolveUserLocale: async () => {
    try {
      const session = await auth.api.getSession({ headers: await headers() })
      return session?.user.locale ?? null
    } catch {
      // A session-fetch failure (DB blip, or a stale / foreign session cookie)
      // must NOT crash locale resolution — it runs inside the root layout's
      // generateMetadata, so an unhandled throw 500s EVERY page. Degrade to the
      // NEXT_LOCALE cookie / defaultLocale instead.
      return null
    }
  },
})
