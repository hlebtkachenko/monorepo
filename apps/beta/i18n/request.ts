import { getRequestConfig } from "next-intl/server"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "./formats"
import { betaMessages } from "./messages"

/**
 * next-intl request config for the beta portal.
 *
 * Unlike apps/web and apps/admin (which negotiate a locale from a cookie and
 * the signed-in user's preference through `@workspace/i18n`'s
 * `buildRequestConfig`), beta is Czech-only: the locale is a constant, so
 * there is nothing to resolve per request.
 */
export default getRequestConfig(() => ({
  locale: BETA_LOCALE,
  timeZone: BETA_TIME_ZONE,
  formats: betaFormats,
  messages: betaMessages,
}))
