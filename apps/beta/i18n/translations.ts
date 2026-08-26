"use client"

import { useTranslations } from "next-intl"

import type { BetaMessageKey } from "./messages"

/**
 * Typed accessor over beta's OWN catalog, for Client Components.
 *
 * `@workspace/i18n` augments next-intl's `AppConfig["Messages"]` with the MAIN
 * product catalog, and that augmentation is global — it reaches this app as
 * soon as anything imports `@workspace/ui` (the brand components resolve
 * `brand.*` through next-intl). Beta ships its own catalog, so next-intl's
 * built-in key checking would reject every beta key. This wrapper restores the
 * checking against `messages/cs.json` instead — `t("landing.heading")` is
 * verified, a typo is a compile error — and confines the cast to one module.
 */
export function useBetaTranslations(): (key: BetaMessageKey) => string {
  return useTranslations() as unknown as (key: BetaMessageKey) => string
}
