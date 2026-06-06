import type { Bot } from "grammy"
import type { Env } from "./env.js"
import { buildIssueKeyboard, escapeHtml } from "./format.js"
import { createStore } from "./state/store.js"
import { createLinearClient } from "./issues/linear.js"
import { processEvent } from "./issues/engine.js"
import { DEFAULT_TEAM_ID } from "./issues/labels.js"
import type { IssueEvent } from "./issues/types.js"

export interface EmitResult {
  status: 200 | 502
  payload: Record<string, unknown>
}

/**
 * Shared path: normalized event -> deduped Linear issue (create or comment+bump) -> Telegram
 * echo with Open / Rerun / Snooze / Ack controls. Used by the HTTP routes, the /issue command,
 * and the scheduled scan. Delivery rule (DEV-63): if the incident's identifier is snoozed or
 * acked, the Linear issue is STILL bumped but the Telegram ping is suppressed.
 */
export async function emitIssue(
  event: IssueEvent,
  env: Env,
  bot: Bot,
): Promise<EmitResult> {
  const target = Number(env.TELEGRAM_USER_ID)

  if (!env.LINEAR_API_TOKEN) {
    await bot.api.sendMessage(
      target,
      `⚠️ ${escapeHtml(event.title)}\n<i>[${escapeHtml(event.source)}]</i> (Linear not configured)`,
      { parse_mode: "HTML" },
    )
    return { status: 200, payload: { ok: true, issue: null } }
  }

  const store = createStore(env.DB)
  const result = await processEvent(event, {
    store,
    linear: createLinearClient(env.LINEAR_API_TOKEN),
    teamId: env.LINEAR_TEAM_ID ?? DEFAULT_TEAM_ID,
    now: () => Date.now(),
  })

  if (!result) {
    await bot.api.sendMessage(
      target,
      `🔴 ${escapeHtml(event.title)}\n<i>[${escapeHtml(event.source)}]</i> (issue create failed)`,
      { parse_mode: "HTML" },
    )
    return { status: 502, payload: { ok: false } }
  }

  const now = Date.now()
  const snooze = await store.getSnooze(result.identifier)
  const suppressed = !!snooze && (snooze.acked || snooze.until > now)

  if (!suppressed) {
    const verb = result.action === "created" ? "🆕" : "🔁"
    const suffix = result.action === "commented" ? ` (×${result.count})` : ""
    await bot.api.sendMessage(
      target,
      `${verb} <b>${result.identifier}</b> ${escapeHtml(event.title)}${suffix}\n<i>[${escapeHtml(event.source)}]</i>`,
      {
        parse_mode: "HTML",
        reply_markup: buildIssueKeyboard(result.identifier, result.url, {
          runId: event.runId,
          runUrl: event.runUrl,
        }),
      },
    )
  }

  return {
    status: 200,
    payload: {
      ok: true,
      suppressed,
      issue: {
        id: result.issueId,
        identifier: result.identifier,
        action: result.action,
        count: result.count,
      },
    },
  }
}
