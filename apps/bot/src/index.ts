import { Hono } from "hono"
import type { IngestPayload } from "@workspace/notify"
import type { Env } from "./env.js"
import { createBot } from "./bot.js"
import {
  constantTimeEqual,
  isAuthorizedIngest,
  isValidWebhookSecret,
} from "./auth.js"
import { buildAskKeyboard, buildKeyboard, renderMessage } from "./format.js"
import { createStore } from "./state/store.js"
import { randomToken } from "./dispatch.js"
import { emitIssue } from "./emit.js"
import type { IssueEvent } from "./issues/types.js"
import { confirmSubscription, snsToEvent, type SnsEnvelope } from "./sns.js"
import {
  pollEndpoints,
  renderBriefing,
  renderScanReport,
  scanToIssue,
} from "./scan.js"
import {
  HEARTBEATS,
  deadManToIssue,
  staleHeartbeats,
  type BeatEntry,
} from "./heartbeats.js"

/** info/success pings are silent; warn/error buzz the phone. */
function isQuiet(level: IngestPayload["level"]): boolean {
  return level === "info" || level === "success"
}

interface AskBody {
  question: string
  options?: string[]
  summary?: string
  ttlSeconds?: number
  id?: string
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
        disable_notification: isQuiet(body.level),
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

  // AGENT HITL (DEV-55): an agent POSTs a question + options, gets an id, then polls /answer/:id.
  app.post("/ask", async (c) => {
    if (!isAuthorizedIngest(c.req.header("authorization"), env.INGEST_SECRET)) {
      return c.json({ error: "unauthorized" }, 401)
    }
    const body = await c.req.json<AskBody>().catch(() => null)
    if (!body?.question) return c.json({ error: "question required" }, 400)
    const options =
      body.options && body.options.length > 0
        ? body.options.slice(0, 6)
        : ["Approve", "Reject"]
    const id = body.id?.trim() || randomToken()
    const now = Date.now()
    const exp = now + (body.ttlSeconds ?? 3600) * 1000
    await createStore(env.DB).putApproval({
      id,
      decision: null,
      options,
      summary: body.summary ?? body.question,
      exp,
      created: now,
    })
    const head = body.summary
      ? `🤖 <b>${body.question}</b>\n${body.summary}`
      : `🤖 <b>${body.question}</b>`
    await bot.api.sendMessage(Number(env.TELEGRAM_USER_ID), head, {
      parse_mode: "HTML",
      reply_markup: buildAskKeyboard(id, options),
    })
    return c.json({ id, exp })
  })

  // The agent long-polls this until `decision` is non-null (or `expired`).
  app.get("/answer/:id", async (c) => {
    if (!isAuthorizedIngest(c.req.header("authorization"), env.INGEST_SECRET)) {
      return c.json({ error: "unauthorized" }, 401)
    }
    const approval = await createStore(env.DB).getApproval(c.req.param("id"))
    if (!approval) return c.json({ error: "not found" }, 404)
    const now = Date.now()
    const expired = !approval.decision && now > approval.exp
    return c.json({
      id: approval.id,
      decision: approval.decision,
      pending: !approval.decision && !expired,
      expired,
      options: approval.options,
    })
  })

  // HEARTBEAT (DEV-62): external jobs check in here so the dead-man's-switch can detect silence.
  app.post("/beat", async (c) => {
    if (!isAuthorizedIngest(c.req.header("authorization"), env.INGEST_SECRET)) {
      return c.json({ error: "unauthorized" }, 401)
    }
    const body = await c.req.json<{ job?: string }>().catch(() => null)
    const job = body?.job?.trim()
    if (!job) return c.json({ error: "job required" }, 400)
    await createStore(env.DB).beat(job, Date.now())
    return c.json({ ok: true, job })
  })

  // AWS SNS HTTPS -> Telegram + auto-issue. Gated by ?token= (SNS can't send auth headers).
  app.post("/sns", async (c) => {
    // Constant-time compare — SNS can't send an auth header, so ?token= is the only gate.
    if (!constantTimeEqual(c.req.query("token") ?? "", env.INGEST_SECRET)) {
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
  // Cron (06:00 + 18:00 Prague): health checklist + dead-man check; morning run adds a briefing.
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const bot = createBot(env)
    const store = createStore(env.DB)
    const target = Number(env.TELEGRAM_USER_ID)
    const now = Date.now()

    const points = await pollEndpoints()

    // Dead-man check BEFORE beating "scan" (else our own beat masks a missed prior run).
    const entries: BeatEntry[] = await Promise.all(
      HEARTBEATS.map(async (spec) => ({
        spec,
        lastRun: await store.lastBeat(spec.key),
      })),
    )
    const stale = staleHeartbeats(entries, now)
    await store.beat("scan", now)

    // 04:00 UTC = morning (Prague) -> daily briefing; otherwise a plain scan report.
    if (event.cron === "0 4 * * *") {
      const incidents = await store.recentDedup(20)
      await bot.api.sendMessage(
        target,
        renderBriefing(points, incidents, stale),
      )
    } else {
      await bot.api.sendMessage(target, renderScanReport(points))
    }

    const scanIssue = scanToIssue(points)
    if (scanIssue) await emitIssue(scanIssue, env, bot)
    const deadMan = deadManToIssue(stale)
    if (deadMan) await emitIssue(deadMan, env, bot)
  },
}
