import type { BetaClientTaskLinkKind, BetaClientTaskStatus } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Úkoly klientovi's Czech labels for `client_task`'s two enums, the twin of
 * `filing-labels.ts` for the filing registry.
 *
 * `satisfies Record<Enum, BetaMessageKey>` makes a new enum value a compile
 * error here rather than a blank cell — `db/schema-drift.test.ts` already
 * fails the build the day a migration adds one, and this is what fails it a
 * second time if the label is forgotten.
 */

export const CLIENT_TASK_STATUS_LABEL_KEY = {
  open: "ukoly.statusOpen",
  done: "ukoly.statusDone",
} as const satisfies Record<BetaClientTaskStatus, BetaMessageKey>

export const CLIENT_TASK_LINK_KIND_LABEL_KEY = {
  none: "ukoly.linkNone",
  dokumenty: "ukoly.linkDokumenty",
  dane: "ukoly.linkDane",
} as const satisfies Record<BetaClientTaskLinkKind, BetaMessageKey>

/**
 * The route a task's `linkKind` points the client at — the coarse in-app
 * destination the migration's own comment on `beta_client_task_link_kind`
 * describes. `"none"` has no href: callers check `linkKind !== "none"`
 * before calling this (mirrors `FilingView.hasAttachment` gating
 * `attachmentDocumentId` in `filing-table.tsx`).
 */
export function clientTaskLinkHref(
  orgSlug: string,
  linkKind: Exclude<BetaClientTaskLinkKind, "none">,
): string {
  return `/${orgSlug}/${linkKind}`
}
