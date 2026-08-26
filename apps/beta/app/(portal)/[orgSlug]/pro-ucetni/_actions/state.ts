import type { BetaMessageKey } from "@/i18n/messages"

/**
 * What the Zpracování save action reports back to its form — the org-tier
 * twin of `app/admin/_actions/state.ts`. Kept as its own module for the same
 * reason: a `"use server"` file may only export async functions, so a type
 * its client component needs (`useActionState`'s initial value) has to live
 * somewhere else.
 *
 * No `issued` case (that one is /admin's setup-link secret). Zpracování never
 * mints a value that only exists once.
 */
export type ProUcetniActionState =
  | { status: "idle" }
  | { status: "ok"; message: BetaMessageKey }
  | { status: "error"; error: BetaMessageKey }

export const PRO_UCETNI_ACTION_IDLE: ProUcetniActionState = { status: "idle" }
