/**
 * admission-reaper lane — periodic backstop sweep of stale `brain_admission_slot`
 * rows (ADR-0028 §Decision.1, #472).
 *
 * Self-registers on import (like permissions-drain) and declares a cron
 * schedule, so boot() enqueues it every 5 minutes via pg-boss with no external
 * scheduler. The handler ignores job data — it is a table sweep, not a
 * data-driven job. See ../jobs/reap-admission-slots.ts for the reap logic +
 * why this is belt-and-braces over the inline reap.
 */

import { registerLane, type Lane } from "./registry"
import { handleReapAdmissionSlots } from "../jobs/reap-admission-slots"

export const ADMISSION_REAPER_LANE_NAME = "admission-reaper"
/** Every 5 minutes. Well past the 90s inline reap window (never races a holder). */
export const ADMISSION_REAPER_CRON = "*/5 * * * *"

const lane: Lane = {
  name: ADMISSION_REAPER_LANE_NAME,
  schedule: { cron: ADMISSION_REAPER_CRON },
  handler: async () => {
    await handleReapAdmissionSlots()
  },
}

registerLane(lane)
