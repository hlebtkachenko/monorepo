"use client"

import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"

import {
  locales,
  localeLabel,
  LOCALE_CHANGE_EVENT,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "@workspace/i18n/config"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Check, Globe } from "@workspace/ui/lib/icons"

/**
 * Footer language switcher.
 *
 * Reads the full locale list from `@workspace/i18n/config` so adding a
 * new language is a single-file change. Persists the chosen code in
 * the `NEXT_LOCALE` cookie (path "/", 1 year) and triggers a router
 * refresh — `next-intl/server` reads the cookie on every request and
 * re-resolves messages.
 *
 * No new UI variants — composes existing `DropdownMenu` + `Button`
 * with the lucide Globe + Check icons. Renders even when only one
 * locale is registered (single-item dropdown is intentional — the
 * picker is part of the design surface and signals that the surface
 * is localizable once additional locales drop into `@workspace/i18n`).
 */
export function LanguagePicker() {
  const router = useRouter()
  const current = useLocale()
  const t = useTranslations("common")

  function setLocale(next: Locale) {
    if (!isLocale(next)) return
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: next }))
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t("changeLanguage")}>
          <Globe aria-hidden="true" />
          <span className="uppercase">{current}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="min-w-32">
        {locales.map((code) => (
          <DropdownMenuItem
            key={code}
            onSelect={() => setLocale(code)}
            className="justify-between gap-3"
          >
            <span>{localeLabel[code]}</span>
            {current === code && (
              <Check className="size-3.5" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
