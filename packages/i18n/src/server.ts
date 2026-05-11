/**
 * Server-side helpers for Server Components, Route Handlers, and Server
 * Actions. Re-export from next-intl/server so consumers can:
 *
 *   import { getTranslations, getFormatter } from "@workspace/i18n/server"
 *
 * without a direct next-intl dependency in app code.
 */
export {
  getTranslations,
  getFormatter,
  getLocale,
  getMessages,
  getNow,
  getTimeZone,
} from "next-intl/server"
