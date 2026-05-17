"use client"

import { useRouter } from "next/navigation"
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
import { Check, Globe } from "@workspace/ui/lib/icons"

/**
 * Footer language switcher (admin variant). Behaviour identical to the
 * apps/web LanguagePicker — same cookie name, same shared locale registry
 * from @workspace/i18n. Duplicated rather than promoted to packages/ui to
 * keep the i18n primitives free of UI-package layout concerns.
 */
export function LanguagePicker() {
  const router = useRouter()
  const current = useLocale()

  function setLocale(next: Locale) {
    if (!isLocale(next)) return
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Change language">
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
