"use client"

import { useEffect, useState } from "react"
import { NextIntlClientProvider } from "@workspace/i18n/client"
import {
  defaultLocale,
  isLocale,
  LOCALE_CHANGE_EVENT,
  LOCALE_COOKIE,
  type Locale,
} from "@workspace/i18n/config"
import csMessages from "@workspace/i18n/messages/cs.json"
import enMessages from "@workspace/i18n/messages/en.json"
import { UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "./_components/language-picker"

const messages = { en: enMessages, cs: csMessages }

function localeFromCookie(): Locale {
  const value = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1)
  return isLocale(value) ? value : defaultLocale
}

// Root error boundary (catches errors in the root layout itself). Must render <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [locale, setLocale] = useState<Locale>(defaultLocale)

  useEffect(() => {
    setLocale(localeFromCookie())
    const onLocaleChange = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail
      if (typeof next === "string" && isLocale(next)) setLocale(next)
    }
    window.addEventListener(LOCALE_CHANGE_EVENT, onLocaleChange)
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, onLocaleChange)
  }, [])

  return (
    <html lang={locale}>
      <body style={{ margin: 0 }}>
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <UtilityPage
            state={
              error.digest
                ? "unexpected_server_error"
                : "unexpected_client_error"
            }
            runtime={{
              surface: "global",
              fallbackChrome: true,
              onRetry: reset,
              referenceId: error.digest,
              buildVersion: process.env.NEXT_PUBLIC_BUILD_SHA,
              report: {
                payload: {
                  message: error.message || "Unknown application error",
                  digest: error.digest,
                  source: "web",
                },
              },
            }}
            footerControl={<LanguagePicker />}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
