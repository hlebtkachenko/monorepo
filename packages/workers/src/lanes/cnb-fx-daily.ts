/**
 * cnb-fx-daily lane — the ČNB daily FX fix ingest, self-registered on import
 * (like admission-reaper) with a tz-pinned cron so boot() enqueues it via
 * pg-boss with no external scheduler.
 *
 * ČNB publishes the fix at ~14:30 Europe/Prague on business days; we run at 14:40
 * Prague (tz-pinned so it does not drift an hour across DST). Weekends/holidays
 * return an empty set the handler logs and ignores. A cron enqueue carries null
 * data → today's date; a manual backfill enqueues `{ date }` for a past day.
 */

import { registerLane, type Lane } from "./registry"
import { handleCnbFxDaily, type CnbFxDailyPayload } from "../jobs/cnb-fx-daily"

export const CNB_FX_DAILY_LANE_NAME = "cnb-fx-daily"
/** 14:40 Europe/Prague, business days (buffer past the 14:30 fix). */
export const CNB_FX_DAILY_CRON = "40 14 * * 1-5"

const lane: Lane<CnbFxDailyPayload> = {
  name: CNB_FX_DAILY_LANE_NAME,
  schedule: { cron: CNB_FX_DAILY_CRON, tz: "Europe/Prague" },
  handler: async (jobs) => {
    for (const job of jobs) {
      await handleCnbFxDaily(job.data ?? {})
    }
  },
}

registerLane(lane)
