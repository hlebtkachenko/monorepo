import sharedCs from "@workspace/i18n/messages/cs.json"

import betaCs from "../messages/cs.json"

/**
 * Beta's runtime catalog.
 *
 * Beta owns its strings (`apps/beta/messages/cs.json`) instead of sharing the
 * main product catalog — the two surfaces have different vocabularies and
 * different release cadences. The one namespace that stays single-source is
 * `brand.*`: `<BrandName>` and friends resolve it through next-intl, so the
 * shared values are merged in here rather than copied.
 */
export const betaMessages = { ...betaCs, brand: sharedCs.brand }

type BetaCatalog = typeof betaCs

/** Every `<namespace>.<key>` pair in beta's own catalog, as a literal union. */
export type BetaMessageKey = {
  [N in keyof BetaCatalog]: `${N & string}.${keyof BetaCatalog[N] & string}`
}[keyof BetaCatalog]
