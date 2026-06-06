import { Hono } from "hono"
import type { Bot } from "grammy"
import type { IngestPayload } from "@workspace/notify"
import type { Env } from "./env.js"
import { createBot } from "./bot.js"
import { isAuthorizedIngest, isValidWebhookSecret } from "./auth.js"
import {
  buildIssueKeyboard,
  buildKeyboard,
  escapeHtml,
  renderMessage,
} from "./format.js"
import { createStore } from "./state/store.js"
import { createLinearClient } from "./issues/linear.js"
import { processEvent } from "./issues/engine.js"
import { DEFAULT_TEAM_ID } from "./issues/labels.js"
import type { IssueEvent } from "./issues/types.js"
import { confirmSubscription, snsToEvent, type SnsEnvelope } from "./sns.js"
import { pollEndpoints, renderScanReport, scanToIssue } from "./scan.js"

/** Shared path: turn a normalized event into a deduped Linear issue + a Telegram echo. */
async function emitIssue(
  event: IssueEvent,
  env: Env,
  bot: Bot,
): Promise<{ status: 200 | 502; payload: Record<string, unknown> }> {
  const target = Number(env.TELEGRAM_USER_ID)

  if (!env.LINEAR_API_TOKEN) {
    await bot.api.sendMessage(
      target,
      `⚠️ ${escapeHtml(event.title)}\n<i>[${escapeHtml(event.source)}]</i> (Linear not configured)`,
      { parse_mode: "HTML" },
    )
    return { status: 200, payload: { ok: true, issue: null } }
  }

  const result = await processEvent(event, {
    store: createStore(env.DB),
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

  const verb = result.action === "created" ? "🆕" : "🔁"
  const suffix = result.action === "commented" ? ` (×${result.count})` : ""
  await bot.api.sendMessage(
    target,
    `${verb} <b>${result.identifier}</b> ${escapeHtml(event.title)}${suffix}\n<i>[${escapeHtml(event.source)}]</i>`,
    {
      parse_mode: "HTML",
      reply_markup: buildIssueKeyboard(result.identifier, result.url),
    },
  )
  return {
    status: 200,
    payload: {
      ok: true,
      issue: {
        id: result.issueId,
        identifier: result.identifier,
        action: result.action,
        count: result.count,
      },
    },
  }
}

function createApp(env: Env) {
  const app = new Hono()
  const bot = createBot(env)

  app.get("/health", (c) =>
    c.json({ ok: true, service: "afframe-bot", env: env.ENVIRONMENT ?? null }),
  )

  // OUTBOUND: app / CI / AWS / agent -> Telegram. Bearer-authed.
  app.post("/ingest", async (c) => {
    if (!isAuthorizedIngest(c.req.header("authorization"), env.INGEST_SECRET)) {
      return c.json({ error: "unauthorized" }, 401)
    }
    const body = await c.req.json<IngestPayload>().catch(() => null)
    if (!body?.text) return c.json({ error: "text required" }, 400)
    await bot.api.sendMessage(
      Number(env.TELEGRAM_USER_ID),
      renderMessage(body),
      {
        parse_mode: "HTML",
        reply_markup: buildKeyboard(body.buttons),
      },
    )
    return c.json({ ok: true })
  })

  // AUTO-ISSUE: CI / security / errors / feedback / agent -> create-or-dedup a Linear issue + echo.
  app.post("/issue", async (c) => {
    if (!isAuthorizedIngest(c.req.header("authorization"), env.INGEST_SECRET)) {
      return c.json({ error: "unauthorized" }, 401)
    }
    const event = await c.req.json<IssueEvent>().catch(() => null)
    if (!event?.title || !event?.source) {
      return c.json({ error: "title + source required" }, 400)
    }
    const { status, payload } = await emitIssue(event, env, bot)
    return c.json(payload, status)
  })

  // AWS SNS HTTPS -> Telegram + auto-issue. Gated by ?token= (SNS can't send auth headers).
  app.post("/sns", async (c) => {
    if (c.req.query("token") !== env.INGEST_SECRET) {
      return c.json({ error: "unauthorized" }, 401)
    }
    const envelope = await c.req.json<SnsEnvelope>().catch(() => null)
    if (!envelope?.Type) return c.json({ error: "bad request" }, 400)
    if (envelope.Type === "SubscriptionConfirmation") {
      const confirmed = await confirmSubscription(envelope)
      return c.json({ ok: confirmed, confirmed })
    }
    const event = snsToEvent(envelope)
    if (!event) return c.json({ ok: true, skipped: true })
    const { status, payload } = await emitIssue(event, env, bot)
    return c.json(payload, status)
  })

  // INBOUND: Telegram -> bot. Verify the secret-token header, then hand off to grammY.
  app.post("/webhook", async (c) => {
    if (
      !isValidWebhookSecret(
        c.req.header("x-telegram-bot-api-secret-token"),
        env.WEBHOOK_SECRET,
      )
    ) {
      return c.text("unauthorized", 401)
    }
    const update = await c.req.json().catch(() => null)
    if (!update) return c.text("bad request", 400)
    await bot.init()
    await bot.handleUpdate(update)
    return c.json({ ok: true })
  })

  return app
}

export default {
  fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Response | Promise<Response> {
    return createApp(env).fetch(request, env, ctx)
  },
  // Cron (06:00 + 18:00 Prague): full health checklist to Telegram; any red -> auto-issue.
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const bot = createBot(env)
    const points = await pollEndpoints()
    await bot.api.sendMessage(
      Number(env.TELEGRAM_USER_ID),
      renderScanReport(points),
    )
    const issue = scanToIssue(points)
    if (issue) await emitIssue(issue, env, bot)
  },
}
