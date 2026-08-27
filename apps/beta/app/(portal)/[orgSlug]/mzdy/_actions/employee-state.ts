import type { BetaMessageKey } from "@/i18n/messages"

/**
 * What `employees.ts`'s register writes (manual-entry plan §3.3, W3) report
 * back to their form — the exact `idle | ok | error` shape
 * `_components/entry-sheet.tsx`'s `EntrySheet<S extends EntrySheetActionState>`
 * requires, mirroring `finance/uvery/_actions/state.ts`'s `UveryActionState`.
 *
 * NOT `MzdyActionState` (`./state.ts`) — that type carries a fourth arm,
 * `issued`, for the employee-SEAT invite's own success case
 * (`employee-seat.ts`). A union WITH `issued` is not assignable to
 * `EntrySheetActionState`, so `EntrySheet` would refuse it at the type level
 * even though the invite form itself never touches this file. Two register
 * writes and one seat invite are three different outcomes; forcing them
 * through one union would make each grow to accommodate the other two.
 *
 * It lives in its own module because a `"use server"` file may only export
 * async functions — a type re-exported from one throws at runtime in Next.
 */
export type EmployeeActionState =
  | { status: "idle" }
  | { status: "ok"; message: BetaMessageKey }
  | { status: "error"; error: BetaMessageKey }

export const EMPLOYEE_ACTION_IDLE: EmployeeActionState = { status: "idle" }
