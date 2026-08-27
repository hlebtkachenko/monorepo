import type { BetaMessageKey } from "@/i18n/messages"

/**
 * What Mzdy's one write reports back to its form (spec §2.6.1 — the
 * employee-seat invite is the only Server Action in this module; everything else
 * under Mzdy is a read, and the payslip upload goes through a route handler
 * because it streams bytes).
 *
 * The same three-plus-one shape `NastaveniActionState` has, minus the arms this
 * section has no use for. It is deliberately NOT an import of that type: the two
 * sections would then share a union whose growth in one place is a compile
 * surface in the other, and Nastavení's `suggestions` arm (ARES) has nothing to
 * do with payroll.
 *
 * It lives in its own module because a `"use server"` file may only export async
 * functions — a type re-exported from one throws at runtime in Next.
 */
export type MzdyActionState =
  | { status: "idle" }
  | { status: "error"; error: BetaMessageKey }
  /**
   * A freshly minted seat invite. The raw secret exists HERE and nowhere else —
   * see `app/_components/issued-invite-link.tsx`, which is what renders it.
   */
  | {
      status: "issued"
      url: string
      email: string
      /** ISO — rendered as a cs-CZ local time by the component. */
      expiresAt: string
    }

export const MZDY_ACTION_IDLE: MzdyActionState = { status: "idle" }
