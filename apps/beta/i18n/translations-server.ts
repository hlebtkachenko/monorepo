import { getTranslations } from "next-intl/server"

import type { BetaMessageKey } from "./messages"

/**
 * Server-side twin of `useBetaTranslations` — same catalog, same typing, for
 * Server Components, Route Handlers, and the Metadata API. See
 * `./translations.ts` for why the cast is needed.
 */
export async function getBetaTranslations(): Promise<
  (key: BetaMessageKey) => string
> {
  const t = await getTranslations()
  return t as unknown as (key: BetaMessageKey) => string
}
