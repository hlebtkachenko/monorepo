# @workspace/i18n

Internationalisation layer built on [next-intl](https://next-intl.dev). Centralises locale config, message catalogs, and Next.js wiring so app packages do not take direct next-intl dependencies.

## Entry points

```ts
// Locale registry + types (safe everywhere)
import {
  locales,
  defaultLocale,
  localeLabel,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
} from "@workspace/i18n"

// next-intl request config — wire into Next.js via i18n/request.ts
import { buildRequestConfig } from "@workspace/i18n/request"

// Server Components, Route Handlers, Server Actions
import {
  getTranslations,
  getFormatter,
  getLocale,
} from "@workspace/i18n/server"

// Client Components
import { useTranslations, useFormatter } from "@workspace/i18n/client"

// Raw JSON message catalog (rarely needed directly)
import messages from "@workspace/i18n/messages/en.json"
```

## What it does

- Defines the `locales` array (`["en"]` today) and the `Locale` branded type.
- `LOCALE_COOKIE` (`"NEXT_LOCALE"`) is read by the middleware resolver before falling back to the DB-persisted `app_user.locale`.
- Adding a new locale requires only: a new BCP-47 code in `locales` and a matching `messages/<code>.json` file.

## Locale resolution order (runtime)

1. `NEXT_LOCALE` cookie (user preference, immediate)
2. `app_user.locale` from the session (DB-persisted default)
3. `defaultLocale` (`"en"`)
