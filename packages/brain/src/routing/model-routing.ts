/**
 * M2.1 — model routing over a booking-template match.
 *
 * A recurring case the workspace has already CONFIRMED a booking_template for
 * (server-verified via `match_booking_template`, never client-claimed) needs
 * no fresh reasoning — the Brain routes it to the CHEAP model. A novel or
 * unmatched case gets no shortcut and escalates to the stronger default
 * reasoning model.
 *
 * This is a PURE client-side routing decision over which model `query()` boots
 * with (wired into `BrainQueryOptions.model` in `apps/cli/src/brain/session-config.ts`).
 * It never touches the server-side gate: `runGatedWrite` does not read this
 * value, does not know which model proposed a write, and holds every write —
 * from either model — identically at cold start. Routing to a cheaper model
 * cannot raise the confident-wrong rate (§I8) because the gate's evidence
 * floor is model-agnostic; it can only change inference cost.
 */

/**
 * The server-verified match outcome this routing decision is made from. NOT a
 * client-claimed confidence — `matched` reflects whether `match_booking_template`
 * (a read-only tool, workspace-scoped, CONFIRMED-templates-only) found a
 * signature match for the current case's counterparty/direction/supplyKind/
 * jurisdiction.
 */
export interface BookingTemplateMatch {
  /** Did a workspace-confirmed booking_template match this case's signature? */
  matched: boolean
}

/** Model alias accepted by the Agent-SDK `query()` `options.model` field. */
export type BrainModelAlias = "haiku" | "sonnet"

/** The default model for a novel/unmatched case — unchanged from today's behavior. */
export const BRAIN_DEFAULT_MODEL: BrainModelAlias = "sonnet"

/** The cheap model a matched recurring case routes to. */
export const BRAIN_RECURRING_MODEL: BrainModelAlias = "haiku"

/**
 * Route: a matched (confirmed, recurring) case → the cheap model; a
 * novel/unmatched case → escalate to the stronger default reasoning model.
 * Pure + deterministic (no I/O, no randomness) so it is unit-testable without
 * a live session.
 */
export function selectBrainModel(match: BookingTemplateMatch): BrainModelAlias {
  return match.matched ? BRAIN_RECURRING_MODEL : BRAIN_DEFAULT_MODEL
}
