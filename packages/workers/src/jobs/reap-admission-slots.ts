/**
 * reap-admission-slots scheduled task (ADR-0028 §Decision.1, #472).
 *
 * Backstop reaper for `brain_admission_slot` (packages/db). The
 * DbAdmissionController reaps dead holders INLINE on every `acquire` (rows whose
 * heartbeat is older than 90s), so under any traffic the table self-cleans. This
 * job is belt-and-braces for the one case the inline reap cannot cover: traffic
 * drains to zero and `acquire` never runs again, so a crashed instance's stale
 * rows would linger forever. It deletes rows whose heartbeat is older than the
 * threshold (default 5 minutes — well past the 90s inline window, so it never
 * races a live holder).
 *
 * Runs on a `withAdminBypass` tx: `brain_admission_slot` has NO RLS (admin-plane
 * infra table), and the admin role is its access path. Idempotent — re-running
 * after a partial sweep simply deletes whatever is still stale.
 *
 * Wired as the `admission-reaper` lane (see ../lanes/admission-reaper.ts), which
 * boot() self-schedules via pg-boss cron.
 */

import { reapExpiredAdmissionSlots, withAdminBypass } from "@workspace/db"
import { logger } from "@workspace/observability"

/** Default staleness threshold. Well past the 90s inline reap window. */
const ADMISSION_REAP_DEFAULT_SECONDS = 300

export interface ReapAdmissionSlotsOptions {
  /** Override the staleness threshold (seconds). Defaults to 300. */
  olderThanSeconds?: number
}

export async function handleReapAdmissionSlots(
  options: ReapAdmissionSlotsOptions = {},
): Promise<void> {
  const olderThanSeconds =
    options.olderThanSeconds ?? ADMISSION_REAP_DEFAULT_SECONDS
  if (!Number.isFinite(olderThanSeconds) || olderThanSeconds <= 0) {
    throw new Error(
      `reap-admission-slots: olderThanSeconds must be a positive number (got ${olderThanSeconds})`,
    )
  }

  const log = logger.child({ task: "reap-admission-slots" })
  log.info({ olderThanSeconds }, "task.start")

  await withAdminBypass((tx) => reapExpiredAdmissionSlots(tx, olderThanSeconds))

  log.info("task.ok")
}
