"use client"

import { ErrorPanel } from "./_components/error-panel"

/**
 * The floor under every route in this app.
 *
 * It renders inside `app/layout.tsx` — so inside `NextIntlClientProvider` and
 * inside `CalmErrorsProvider` — and catches anything the more specific
 * boundaries below it do not: /admin, the `(auth)` group, and the `(portal)`
 * group's own layout (which resolves the org scope, and is therefore the one
 * place in the portal tree an error can happen ABOVE
 * `[orgSlug]/error.tsx`).
 *
 * NO `global-error.tsx` ALONGSIDE IT, deliberately. That file replaces the root
 * layout rather than rendering inside it, which means it also replaces the
 * provider that carries the calm flag — it could only ever render the loud tone,
 * so adding one would change flag-off behaviour and buy nothing flag-on. It also
 * only fires when `app/layout.tsx` ITSELF throws (fonts, locale, brand text),
 * which is a broken deployment rather than the transient data failure this mode
 * is about.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorPanel where="app" error={error} reset={reset} />
}
