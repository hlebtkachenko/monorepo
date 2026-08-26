import "server-only"

import {
  betaClientTaskEmail,
  betaDocumentAttentionEmail,
  betaPeriodPublishedEmail,
  sendEmail,
  type EmailMessage,
} from "@workspace/email"

import type { BetaDocumentStatus, BetaImportDataset } from "@/db/schema"
import type { NotificationRecipient } from "@/lib/data/notification-prefs"

import { betaPortalUrl } from "./portal-url"

/**
 * Notification dispatch — spec §2.11's 3 events, turned into `@workspace/email`
 * messages and sent one per recipient.
 *
 * DELIBERATELY DB-FREE. Every function below takes an ALREADY-RESOLVED
 * recipient list (`lib/data/notification-prefs.ts`'s `notifiableOrgMembers` —
 * the toggle, the disabled-user filter and the client-side role filter all
 * live there, not here), never an organization id it would query itself. That
 * split is what keeps this module pure orchestration + external I/O, so its
 * own test suite mocks `@workspace/email` and needs no Postgres
 * (`apps/beta/vitest.config.ts`'s "pure" project, unlike `lib/data/**`).
 *
 * NEVER REJECTS. A per-recipient `sendEmail` failure is caught and logged
 * right here — one broken mailbox must not take the other recipients down
 * with it, and must not surface as an unhandled rejection in a caller that
 * fired this with `void`.
 *
 * SEND-AFTER-COMMIT IS THE CALLER'S JOB, NOT THIS MODULE'S. Every call site
 * (`lib/data/documents-office.ts`, `lib/data/client-tasks.ts`, `lib/data/
 * imports.ts`) calls `void notifyX(...)` AFTER its own write has committed —
 * for `imports.ts`'s `publishBatch`, specifically AFTER the `betaDb().
 * transaction(...)` call returns, never from inside the transaction callback.
 * A rolled-back write must never have already sent mail, and there is no
 * outbox table backing that promise (spec §2.11 gives this feature no
 * durability requirement beyond "it sends"): a process crash between commit
 * and send drops the one email, which is the accepted MVP trade stated in the
 * PR description — Nastavení › Účet still shows the same fact on next visit.
 */

function logSendFailure(event: string, to: string, error: unknown): void {
  console.error(`[beta:notifications] ${event} send failed for ${to}`, error)
}

async function dispatch(
  event: string,
  recipients: readonly NotificationRecipient[],
  build: (to: string) => EmailMessage,
): Promise<void> {
  await Promise.all(
    recipients.map(async (recipient) => {
      try {
        await sendEmail(build(recipient.email))
      } catch (error) {
        logSendFailure(event, recipient.email, error)
      }
    }),
  )
}

/**
 * The event-1 predicate, pure and exported so `documents-office.test.ts` and
 * this module's own suite can both walk it exhaustively without touching a
 * database. `saveDocumentOffice` (`lib/data/documents-office.ts`) calls this
 * with the row it read BEFORE the write and the row its own successful UPDATE
 * returned — never with the patch it was given, so it stays correct
 * regardless of which fields the caller happened to submit unchanged.
 *
 * TWO INDEPENDENT CONDITIONS, EITHER ONE FIRES (spec §2.11: "returned OR new
 * office_message"):
 *   - a REAL transition into `returned` (not a resave of an already-returned
 *     row — self-loops do not exist in `LEGAL_TRANSITIONS` anyway);
 *   - `office_message` is now non-null AND different from what it was — a
 *     message added or edited on ANY status, including one that does not
 *     touch `returned` at all.
 * A transition into `returned` always satisfies the second condition too
 * (the DB requires a message there), so the two conditions overlap on that
 * path by construction rather than by coincidence.
 */
export function documentAttentionTrigger(
  before: {
    readonly status: BetaDocumentStatus
    readonly officeMessage: string | null
  },
  after: {
    readonly status: BetaDocumentStatus
    readonly officeMessage: string | null
  },
): boolean {
  const transitionedToReturned =
    before.status !== "returned" && after.status === "returned"
  const messageChanged =
    after.officeMessage !== null && after.officeMessage !== before.officeMessage
  return transitionedToReturned || messageChanged
}

/** Event 1 (spec §2.11): a document transitioned to `returned`, or the office
 * wrote a new `office_message` on it. Fired from `saveDocumentOffice`
 * (`lib/data/documents-office.ts`) — see `documentAttentionTrigger` there for
 * the exact before/after predicate. */
export async function notifyDocumentAttention(
  recipients: readonly NotificationRecipient[],
  input: {
    readonly orgSlug: string
    readonly organizationName: string
    readonly filename: string
    readonly officeMessage: string
  },
): Promise<void> {
  const url = betaPortalUrl(`/${input.orgSlug}/dokumenty`)
  await dispatch("document-attention", recipients, (to) =>
    betaDocumentAttentionEmail({
      to,
      organizationName: input.organizationName,
      filename: input.filename,
      officeMessage: input.officeMessage,
      url,
    }),
  )
}

/** Event 2 (spec §2.11): a new `client_task`. Fired from `createClientTask`
 * (`lib/data/client-tasks.ts`) — NOT from `createMonthlyTaskSet`'s bulk
 * generation, which can mint one row per active template in a single click
 * and would otherwise turn "Vytvořit měsíční sadu úkolů" into a mail blast;
 * see that module's own note on the distinction. */
export async function notifyClientTaskCreated(
  recipients: readonly NotificationRecipient[],
  input: {
    readonly orgSlug: string
    readonly organizationName: string
    readonly title: string
    /** Pre-formatted (`formatBetaDate`) — see `templates.ts`'s own note on why
     * this package never formats a date itself. */
    readonly dueDateLabel: string
  },
): Promise<void> {
  const url = betaPortalUrl(`/${input.orgSlug}`)
  await dispatch("client-task-created", recipients, (to) =>
    betaClientTaskEmail({
      to,
      organizationName: input.organizationName,
      title: input.title,
      dueDateLabel: input.dueDateLabel,
      url,
    }),
  )
}

/** Event 3 (spec §2.11): a new period published. Fired from `publishBatch`
 * (`lib/data/imports.ts`) on every genuine publish — a first publish AND a
 * supersession replace both put previously-unseen numbers in front of the
 * client, which is the literal reading of "new period published"; an
 * IDEMPOTENT re-publish (`alreadyPublished: true`, nothing changed) does not
 * fire — see that function's own call site. */
export async function notifyPeriodPublished(
  recipients: readonly NotificationRecipient[],
  input: {
    readonly orgSlug: string
    readonly organizationName: string
    /** e.g. "Rozvaha" — see `datasetLabelsCs` in this module. */
    readonly datasetLabel: string
    /** Pre-formatted (`formatReportingPeriodLabel`). */
    readonly periodLabel: string
  },
): Promise<void> {
  const url = betaPortalUrl(`/${input.orgSlug}/vykazy`)
  await dispatch("period-published", recipients, (to) =>
    betaPeriodPublishedEmail({
      to,
      organizationName: input.organizationName,
      datasetLabel: input.datasetLabel,
      periodLabel: input.periodLabel,
      url,
    }),
  )
}

/**
 * Czech labels for `notifyPeriodPublished`'s `datasetLabel` — the Výkazy
 * sidebar names (spec §2.5), kept local to notifications rather than in
 * `lib/format/` because Výkazy itself (PR 25) has not shipped a UI yet to own
 * this mapping; a component-facing catalog can absorb this the day it does.
 * All five `BetaImportDataset` values are covered, not just the three
 * implemented today, the same completeness `IMPORT_DATASETS` (`lib/data/
 * imports.ts`) keeps.
 */
export const DATASET_LABELS_CS: Record<BetaImportDataset, string> = {
  predvaha: "Obratová předvaha",
  rozvaha: "Rozvaha",
  vzz: "Výsledovka",
  saldokonto: "Saldokonto",
  payroll: "Mzdy",
}
