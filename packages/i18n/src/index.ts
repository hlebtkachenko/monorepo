/**
 * Public `@workspace/i18n` entry points.
 *
 *   @workspace/i18n           types + locale config (cross-cutting)
 *   @workspace/i18n/config    locales array, default, cookie name
 *   @workspace/i18n/request   buildRequestConfig() — wire into Next via i18n/request.ts
 *   @workspace/i18n/server    Server Component / Route Handler / Server Action helpers
 *   @workspace/i18n/client    Client Component hooks + provider
 *   @workspace/i18n/messages/<locale>.json   raw message catalogs (rare)
 */
export {
  locales,
  defaultLocale,
  localeLabel,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
} from "./config"
