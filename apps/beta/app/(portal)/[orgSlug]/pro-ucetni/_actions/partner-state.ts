import type { BetaMessageKey } from "@/i18n/messages"
import type { PartnerAresSuggestion } from "@/lib/ares/partner-suggestions"

/**
 * What Zadávání dat › Partneři's form reports back — the partner-shaped twin
 * of `nastaveni/_actions/state.ts`'s `NastaveniActionState`. Same extra arm,
 * for the same reason: `suggestions` is what an ARES lookup returns INSTEAD
 * of writing anything, so a refactor cannot turn a lookup into a save by
 * accident.
 *
 * `partnerId` rides on the suggestions arm because ONE form serves both
 * "Nový partner" (no id yet) and an existing row's edit disclosure (id
 * present) — the component needs to know which case produced this list.
 *
 * Lives in its own module because a `"use server"` file may only export async
 * functions.
 */
export type PartnerActionState =
  | { status: "idle" }
  | { status: "ok"; message: BetaMessageKey }
  | { status: "error"; error: BetaMessageKey }
  | {
      status: "suggestions"
      /** Null while creating — there is no row yet to have stamped. */
      partnerId: string | null
      suggestions: PartnerAresSuggestion[]
      fetchedAt: string
      cached: boolean
    }

export const PARTNER_ACTION_IDLE: PartnerActionState = { status: "idle" }
