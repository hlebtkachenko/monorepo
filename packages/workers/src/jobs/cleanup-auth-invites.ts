/**
 * cleanup-auth-invites scheduled task.
 *
 * Daily soft-mark of expired auth_invite rows. Invites are audit-
 * relevant history (who was invited, by whom, to which organization)
 * so they are NEVER hard-deleted. This job transitions pending rows
 * whose `expires_at` has passed to status='expired', making the
 * distinction from 'revoked' (admin action) and 'accepted' (used
 * invite) visible in the audit trail.
 *
 * Wire into a scheduler (BullMQ repeat, cron, etc.) with a daily
 * cadence. The handler is idempotent — re-running it after a partial
 * batch picks up whatever's still pending and past expires_at.
 */

import { expireDuePendingInvites } from "@workspace/auth/invite-issuer"
import { logger } from "@workspace/observability"

export async function handleCleanupAuthInvites(): Promise<void> {
  const log = logger.child({ task: "cleanup-auth-invites" })
  log.info({}, "task.start")

  const expired = await expireDuePendingInvites()

  log.info({ expired }, "task.ok")
}
