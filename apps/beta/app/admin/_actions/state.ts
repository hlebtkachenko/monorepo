import type { BetaMessageKey } from "@/i18n/messages"

/**
 * What every /admin action reports back to its form.
 *
 * One shape for all of them, so one client component (`AdminActionForm`) can
 * render the outcome of an invite, a role change, an archive and a revoke
 * without any of them growing its own status handling. The action returns a
 * message KEY rather than a sentence: the server has no locale context and the
 * browser already holds the catalog.
 *
 * It lives in its own module because a `"use server"` file may only export
 * async functions — a type re-exported from one throws at runtime in Next.
 *
 * `issued` IS THE ONLY TIME A RAW LINK EXISTS OUTSIDE THE EMAIL THAT NEVER GETS
 * SENT. It travels from the action to this render and nowhere else: it is not
 * written to the database (only `sha256(token)` is), not logged, and not
 * recoverable afterwards — the registry has no field for it. A lost link is
 * re-issued, never re-read. `AdminActionForm` therefore keeps it in component
 * state and drops it on the next submit.
 */
export type AdminActionState =
  | { status: "idle" }
  | { status: "ok"; message: BetaMessageKey }
  | { status: "error"; error: BetaMessageKey }
  | {
      status: "issued"
      /** Shown once. See above. */
      url: string
      email: string
      expiresAt: string
    }
  | {
      status: "issuedKey"
      /**
       * A freshly minted agent key. Same once-only contract as `issued` above,
       * and a separate arm rather than a reused `url` field on purpose: a key is
       * not a link, it must never be rendered as one (no anchor, no autolink),
       * and it has no expiry to show — it lives until it is revoked.
       */
      secret: string
      label: string
    }

export const ADMIN_ACTION_IDLE: AdminActionState = { status: "idle" }

export type AdminAction = (
  previous: AdminActionState,
  formData: FormData,
) => Promise<AdminActionState>
