import type { BetaMessageKey } from "@/i18n/messages"
import type { AresSuggestion } from "@/lib/ares/suggestions"

/**
 * What every Nastavení write reports back to its form.
 *
 * Mirrors `majetek/_actions/state.ts`'s shape — one type for every action — with
 * one extra arm: `suggestions`, which the ARES lookup returns INSTEAD of writing
 * anything. That arm is the whole "ARES navrhuje" rule expressed in the type:
 * the only thing a lookup can produce is a list to be shown, so a refactor
 * cannot turn it into a save by accident.
 *
 * There is no shared `NastaveniAction` alias / action-form component here, the
 * way Majetek has one: this section's three forms are genuinely different
 * shapes (a wide identity card, a suggestion list with two submit intents, and
 * the credential controls that go through Better Auth's HTTP surface rather
 * than a Server Action at all), so one wrapper would be an abstraction with a
 * single real consumer.
 *
 * It lives in its own module because a `"use server"` file may only export async
 * functions — a type re-exported from one throws at runtime in Next.
 */
export type NastaveniActionState =
  | { status: "idle" }
  | { status: "ok"; message: BetaMessageKey }
  | { status: "error"; error: BetaMessageKey }
  | {
      status: "suggestions"
      /** Empty when ARES agrees with the book on every field it knows. */
      suggestions: AresSuggestion[]
      /** ISO stamp of the answer behind these suggestions. */
      fetchedAt: string
      /** True when it came from the 24h cache rather than a fresh call. */
      cached: boolean
      /**
       * Set when this list is what REMAINS after an acceptance — the accept
       * path returns the same arm as the lookup, minus the fields it just
       * wrote, so the panel has ONE state to render and no effect mirroring a
       * second one into it.
       */
      message?: BetaMessageKey
    }

export const NASTAVENI_ACTION_IDLE: NastaveniActionState = { status: "idle" }
