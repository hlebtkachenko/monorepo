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
  // `@workspace/i18n` augments next-intl's global `AppConfig["Messages"]` with
  // the MAIN product catalog, and that augmentation reaches this app as soon as
  // anything imports `@workspace/ui`. next-intl then type-checks beta's own
  // catalog against a foreign one: as long as beta's namespaces happened to be
  // new (`app`, `nav`, `landing`) that was merely useless, but `auth` exists in
  // both with different keys, which makes it an error. Beta's key checking
  // comes from `BetaMessageKey` at every `t(...)` call site instead — see
  // `./translations.ts`, which confines the same cast for the client hook.
  messages: betaMessages as never,
}))
