/// <reference path="./global.d.ts" />

/**
 * Client-side helpers. Re-export from next-intl so consumers can:
 *
 *   "use client"
 *   import { useTranslations, useFormatter } from "@workspace/i18n/client"
 */
export {
  useTranslations,
  useFormatter,
  useLocale,
  useNow,
  useTimeZone,
  NextIntlClientProvider,
} from "next-intl"
