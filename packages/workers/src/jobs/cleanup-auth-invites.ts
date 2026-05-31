/**
 * cleanup-auth-invites scheduled task.
 *
 * Daily soft-mark of expired invite rows in `auth_token` (kind='inv').
 * Invites are audit-relevant history (who was invited, by whom, to which
 * organization) so they are NEVER hard-deleted. This job transitions
 * pending rows whose `expires_at` has passed to status='expired',
 * making the distinction from 'revoked' (admin action) and 'consumed'
 * (used invite) visible in the audit trail.
 *
 * Wire into a scheduler (BullMQ repeat, cron, etc.) with a daily
 * cadence. The handler is idempotent — re-running it after a partial
 * batch picks up whatever's still pending and past expires_at.
 *
 * Note: the generic `expireDueAuthTokens` helper in @workspace/auth/tokens
 * does the same thing for every kind. This thin wrapper keeps the
 * 'invite-only' semantics in ops dashboards / scheduler config.
 */

import { expireDuePendingInvites } from "@workspace/auth/invite-issuer"
import { logger } from "@workspace/observability"

export async function handleCleanupAuthInvites(): Promise<void> {
  const log = logger.child({ task: "cleanup-auth-invites" })
  log.info({}, "task.start")

  const expired = await expireDuePendingInvites()

  log.info({ expired }, "task.ok")
}
