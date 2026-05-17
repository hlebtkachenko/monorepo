import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import { buildRequestConfig } from "@workspace/i18n/request"

/**
 * next-intl request config for the admin app. Mirrors apps/web/i18n/request.ts
 * so locale resolution behaves identically across the two surfaces:
 *   1. NEXT_LOCALE cookie (LanguagePicker writes it on user action)
 *   2. app_user.locale from the current Better Auth session
 *   3. defaultLocale ("en")
 */
export default buildRequestConfig({
  resolveUserLocale: async () => {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user.locale ?? null
  },
})
