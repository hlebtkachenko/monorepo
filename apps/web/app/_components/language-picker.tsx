"use client"

import { useRouter } from "next/navigation"
import { Globe, Check } from "lucide-react"
import { useLocale } from "next-intl"

import {
  locales,
  localeLabel,
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
 * with the lucide Globe + Check icons. Picker hides when only one
 * locale is registered (current state with `en` only) instead of
 * rendering a degenerate single-option dropdown.
 */
export function LanguagePicker() {
  const router = useRouter()
  const current = useLocale()

  if (locales.length <= 1) return null

  function setLocale(next: Locale) {
    if (!isLocale(next)) return
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Change language"
          className="gap-1.5"
        >
          <Globe className="size-3.5" aria-hidden="true" />
          <span className="uppercase">{current}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-32">
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
