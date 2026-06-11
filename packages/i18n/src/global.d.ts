/**
 * next-intl strict typing (AppConfig augmentation).
 *
 * Declares the canonical `en.json` catalog as the message shape and the
 * `locales` registry as the locale union. Every consumer that imports any
 * `@workspace/i18n` entry point (the entry files carry a triple-slash
 * reference to this file) gets compile-time key checking on
 * `useTranslations` / `getTranslations` — a typo'd key like
 * `t("auth.lgoin.title")` becomes a type error instead of a render-time
 * failure.
 *
 * `cs.draft.json` is intentionally NOT part of this type: drafts are not
 * live locales (they are reviewable artifacts, excluded from `locales`).
 */
import type en from "./messages/en.json"
import type { Locale } from "./config"

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale
    Messages: typeof en
  }
}
