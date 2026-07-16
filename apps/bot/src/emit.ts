import type { Bot } from "grammy"
import type { Env } from "./env.js"
import { buildAlertKeyboard, buildIssueKeyboard, escapeHtml } from "./format.js"
import { createStore } from "./state/store.js"
import { createGitHubIssueClient } from "./issues/github.js"
import { processEvent } from "./issues/engine.js"
import { parseProjectFieldConfig } from "./issues/labels.js"
import type { IssueEvent } from "./issues/types.js"
import { repoOf } from "./github.js"

export interface EmitResult {
  status: 200 | 502
  payload: Record<string, unknown>
}

/**
 * Issue-noise policy: transient CI failures and runtime application errors alert Telegram but
 * never open a GitHub issue — they recur constantly and drown the tracker. GitHub issues stay
 * reserved for deliberate, when-idle signals: security-scan findings, blocking accounting-gate
 * integrity ("agent"), and explicit user feedback ("customer-request"). To make a source open
 * issues again, drop it from this set.
 */
const ALERT_ONLY_SOURCES = new Set<IssueEvent["source"]>([
  "ci-failure",
  "error",
])

/**
 * Shared path: normalized event -> deduped GitHub issue (create or comment+bump) -> Telegram
 * echo with Open / Rerun / Snooze / Ack controls. Used by explicit issue routes and
 * the /issue command. Delivery rule (DEV-63): if the incident's identifier is snoozed or
 * acked, the GitHub issue is STILL bumped but the Telegram ping is suppressed.
 */
export async function emitIssue(
  event: IssueEvent,
  env: Env,
  bot: Bot,
): Promise<EmitResult> {
  const target = Number(env.TELEGRAM_USER_ID)

  if (ALERT_ONLY_SOURCES.has(event.source)) {
    await bot.api.sendMessage(
      target,
      `⚠️ ${escapeHtml(event.title)}\n<i>[${escapeHtml(event.source)}]</i>`,
      {
        parse_mode: "HTML",
        reply_markup: buildAlertKeyboard({
          runId: event.runId,
          runUrl: event.runUrl,
        }),
      },
    )
    return { status: 200, payload: { ok: true, issue: null, alertOnly: true } }
  }

  const token = env.GITHUB_ISSUES_TOKEN ?? env.GITHUB_DISPATCH_TOKEN
  const repo = repoOf(env)
  if (!token || !repo) {
    await bot.api.sendMessage(
      target,
      `⚠️ ${escapeHtml(event.title)}\n<i>[${escapeHtml(event.source)}]</i> (GitHub issue tracking not configured)`,
      { parse_mode: "HTML" },
    )
    return { status: 200, payload: { ok: true, issue: null } }
  }

  const store = createStore(env.DB)
  const parentIssueNumber = parseIssueNumber(env.GITHUB_EPIC_ISSUE_NUMBER)
  const result = await processEvent(event, {
    store,
    issues: createGitHubIssueClient(token, repo),
    repo,
    projectId: env.GITHUB_PROJECT_ID,
    projectFieldConfig: parseProjectFieldConfig(
      env.GITHUB_PROJECT_FIELD_CONFIG,
    ),
    parentIssueNumber,
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

function parseIssueNumber(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}
