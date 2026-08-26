import type { BetaMessageKey } from "@/i18n/messages"

/**
 * What every Majetek write reports back to its form.
 *
 * Mirrors `app/admin/_actions/state.ts`'s shape (one type for every action, so
 * one client component renders all of them), kept as its own module-scoped
 * type rather than imported across the admin/org boundary — the two surfaces
 * have different audiences and no reason to share a union.
 *
 * It lives in its own module because a `"use server"` file may only export
 * async functions — a type re-exported from one throws at runtime in Next.
 */
export type MajetekActionState =
  | { status: "idle" }
  | { status: "ok"; message: BetaMessageKey }
  | { status: "error"; error: BetaMessageKey }

export const MAJETEK_ACTION_IDLE: MajetekActionState = { status: "idle" }

export type MajetekAction = (
  previous: MajetekActionState,
  formData: FormData,
) => Promise<MajetekActionState>
