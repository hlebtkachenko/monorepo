/**
 * prune-auth-tokens scheduled task (ADR-0022).
 *
 * Nightly maintenance of the auth_token table:
 *
 *   1. Expire any pending row whose `expires_at` is in the past
 *      (`expireDueAuthTokens`). Idempotent; reflects the lifecycle
 *      transition in the audit trail rather than leaving stale pending
 *      rows.
 *   2. Delete every terminal-state row (consumed / revoked / expired)
 *      whose `issued_at` is older than the retention cutoff
 *      (`pruneTerminalAuthTokens`). Retention defaults to 90 days, set
 *      to support forensic investigation of compromised accounts;
 *      callers can shorten it for ephemeral environments.
 *
 * The DELETE trigger in 0017_auth_token.sql refuses to delete rows in
 * status='pending', so even a buggy caller cannot accidentally erase
 * an in-flight token. Step 1 must therefore run before step 2.
 *
 * Wire into a scheduler (BullMQ repeat, pg-boss cron, systemd timer)
 * with a daily cadence. The handler is idempotent — re-running it after
 * a partial batch picks up whatever's still terminal-and-old.
 */

import {
  expireDueAuthTokens,
  pruneTerminalAuthTokens,
} from "@workspace/auth/tokens"
import { logger } from "@workspace/observability"

/** Default retention for terminal-state rows. ADR-0022 §"Consequences". */
export const DEFAULT_RETENTION_DAYS = 90

export interface PruneAuthTokensResult {
  /** Rows transitioned pending → expired. */
  expired: number
  /** Rows deleted (consumed + revoked + previously expired, older than cutoff). */
  pruned: number
}

export interface PruneAuthTokensOptions {
  /** Override the retention cutoff. Defaults to 90 days. */
  retentionDays?: number
  /** Injectable clock. Tests pass a fixed Date for deterministic cutoffs. */
  now?: () => Date
}

export async function handlePruneAuthTokens(
  options: PruneAuthTokensOptions = {},
): Promise<PruneAuthTokensResult> {
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error(
      `prune-auth-tokens: retentionDays must be a positive number (got ${retentionDays})`,
    )
  }
  const now = options.now?.() ?? new Date()
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)

  const log = logger.child({ task: "prune-auth-tokens" })
  log.info({ retentionDays, cutoff }, "task.start")

  const expired = await expireDueAuthTokens()
  const pruned = await pruneTerminalAuthTokens({ olderThan: cutoff })

  log.info({ expired, pruned }, "task.ok")

  return { expired, pruned }
}
