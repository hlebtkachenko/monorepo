import type { BetaMessageKey } from "@/i18n/messages"

/**
 * What every Úvěry write reports back to its form.
 *
 * Mirrors `majetek/_actions/state.ts`'s shape (one type for every action, so
 * one client component renders all of them), kept as its own module-scoped type
 * rather than shared across modules — the two surfaces have different message
 * namespaces and no reason to share a union.
 *
 * It lives in its own module because a `"use server"` file may only export
 * async functions — a type re-exported from one throws at runtime in Next.
 */
export type UveryActionState =
  | { status: "idle" }
  | { status: "ok"; message: BetaMessageKey }
  | { status: "error"; error: BetaMessageKey }

export const UVERY_ACTION_IDLE: UveryActionState = { status: "idle" }

export type UveryAction = (
  previous: UveryActionState,
  formData: FormData,
) => Promise<UveryActionState>
