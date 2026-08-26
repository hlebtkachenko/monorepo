import type { BetaMessageKey } from "@/i18n/messages"

/**
 * What a consume action reports back to its form.
 *
 * The action returns a message KEY, never a rendered sentence: the server has
 * no locale context and the client already holds the catalog. It lives in its
 * own module because a `"use server"` file may only export async functions —
 * a type re-exported from one throws at runtime in Next.js.
 *
 * `redirectTo` is always a server-side constant. Nothing from the request ever
 * reaches it, so there is no open-redirect surface, and the token is never part
 * of it (the link must not survive its own consume).
 */
export type ConsumeFormState =
  | { status: "error"; error: BetaMessageKey }
  | { status: "consumed"; email: string; signIn: boolean; redirectTo: string }
