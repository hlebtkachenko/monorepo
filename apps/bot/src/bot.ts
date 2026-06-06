import { Bot } from "grammy"
import type { Context } from "grammy"
import type { Env } from "./env.js"
import { isAllowedUser } from "./auth.js"
import { READ_COMMANDS } from "./commands.js"
import { parseCommand, randomToken, WRITE_COMMANDS } from "./dispatch.js"
import { parseCallback, runCallback } from "./callbacks.js"
import {
  buildButtons,
  buildConfirmKeyboard,
  buildEnvPicker,
  escapeHtml,
} from "./format.js"
import { createStore, type Store } from "./state/store.js"
import { createGitHubClient, repoOf } from "./github.js"
import { emitIssue } from "./emit.js"
import type { IssueEvent } from "./issues/types.js"

function githubFor(env: Env) {
  return env.GITHUB_DISPATCH_TOKEN
    ? createGitHubClient(env.GITHUB_DISPATCH_TOKEN, repoOf(env))
    : null
}

/** Validate a write command, persist a pending dispatch, ask for a confirm tap. */
async function startDispatch(
  ctx: Context,
  store: Store,
  name: string,
  args: string,
): Promise<void> {
  const { plan, error } = parseCommand(name, args)
  if (!plan) {
    await ctx.reply(`⚠️ ${error ?? "Invalid command."}`)
    return
  }
  const now = Date.now()
  const token = randomToken()
  await store.createDispatch({
    token,
    kind: plan.kind,
    payload: JSON.stringify(plan),
    status: "pending",
    exp: now + 5 * 60_000,
    created: now,
  })
  await ctx.reply(
    `⚠️ Confirm: <b>${escapeHtml(plan.label)}</b>\nDispatches <code>${escapeHtml(plan.workflow)}</code> on <code>${escapeHtml(plan.ref)}</code>. Expires in 5 min.`,
    { parse_mode: "HTML", reply_markup: buildConfirmKeyboard(token) },
  )
}

/** Build a grammY bot: allowlist guard, read commands, confirm-gated writes, pickers, /issue, taps. */
export function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN)
  const allowed = Number(env.TELEGRAM_USER_ID)
  const store = createStore(env.DB)

  // Allowlist guard — only the owner may drive the bot. Everyone else is silently dropped.
  bot.use(async (ctx, next) => {
    if (!isAllowedUser(ctx.from?.id, allowed)) {
      if (ctx.callbackQuery)
        await ctx.answerCallbackQuery({ text: "Not authorized." })
      return
    }
    await next()
  })

  // Read commands (logs is handled explicitly below for its picker).
  for (const [name, handler] of Object.entries(READ_COMMANDS)) {
    if (name === "logs") continue
    bot.command(name, async (ctx) => {
      await ctx.reply(await handler(env, ctx.match ?? ""))
    })
  }

  // /logs <runId> -> summary; bare /logs -> pick a recent run from buttons.
  bot.command("logs", async (ctx) => {
    const arg = (ctx.match ?? "").trim()
    if (arg) {
      await ctx.reply(await READ_COMMANDS.logs!(env, arg))
      return
    }
    const gh = githubFor(env)
    if (!gh) {
      await ctx.reply("GitHub control not configured.")
      return
    }
    const runs = (await gh.listRuns(10)).filter((r) => r.status === "completed")
    if (runs.length === 0) {
      await ctx.reply("No recent completed runs.")
      return
    }
    await ctx.reply("Pick a run to inspect:", {
      reply_markup: buildButtons(
        runs.slice(0, 8).map((r) => [
          {
            text: `${r.conclusion === "failure" ? "🔴" : "✅"} ${r.name} · ${r.branch}`,
            data: `log:${r.id}`,
          },
        ]),
      ),
    })
  })

  // /deploy <env> -> confirm; bare /deploy -> pick environment from buttons.
  bot.command("deploy", async (ctx) => {
    const arg = (ctx.match ?? "").trim()
    if (arg) {
      await startDispatch(ctx, store, "deploy", arg)
      return
    }
    await ctx.reply("Pick an environment to deploy:", {
      reply_markup: buildEnvPicker("dep"),
    })
  })

  // /rollback <env> <tag> -> confirm; /rollback <env> -> pick a tag; bare -> pick environment.
  bot.command("rollback", async (ctx) => {
    const parts = (ctx.match ?? "").trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      await startDispatch(ctx, store, "rollback", parts.join(" "))
      return
    }
    if (parts.length === 1) {
      // env chosen via text -> jump straight to the tag picker (reuse the callback path).
      const out = await runCallback(
        { t: "rbenv", env: parts[0]! },
        { store, github: githubFor(env), now: () => Date.now() },
      )
      await ctx.reply(out.reply ?? "—", {
        reply_markup: out.replyMarkup
          ? buildButtons(out.replyMarkup)
          : undefined,
      })
      return
    }
    await ctx.reply("Pick an environment to roll back:", {
      reply_markup: buildEnvPicker("rb"),
    })
  })

  // No-arg write commands keep the simple confirm flow.
  for (const name of WRITE_COMMANDS) {
    if (name === "deploy" || name === "rollback") continue
    bot.command(name, async (ctx) => {
      await startDispatch(ctx, store, name, ctx.match ?? "")
    })
  }

  // /issue <title> — open a Linear incident from the phone (deduped like any other event).
  bot.command("issue", async (ctx) => {
    const title = (ctx.match ?? "").trim()
    if (!title) {
      await ctx.reply("Usage: /issue <title>")
      return
    }
    const event: IssueEvent = {
      source: "agent",
      title,
      body: "Opened manually from Telegram.",
      fingerprintParts: ["manual", title.toLowerCase()],
      area: "infra",
      risk: "medium",
    }
    await emitIssue(event, env, bot)
  })

  // /pending — list open agent approvals, each with a Cancel button.
  bot.command("pending", async (ctx) => {
    const open = await store.listPendingApprovals(Date.now())
    if (open.length === 0) {
      await ctx.reply("✅ No pending approvals.")
      return
    }
    await ctx.reply(`⏳ ${open.length} pending approval(s):`, {
      reply_markup: buildButtons(
        open.map((a) => [
          {
            text: `🚫 ${(a.summary ?? a.id).slice(0, 48)}${a.asker ? ` [${a.asker}]` : ""}`,
            data: `xpr:${a.id}`,
          },
        ]),
      ),
    })
  })

  // Free-text HITL replies: a reply to an /ask (text) prompt records the answer.
  bot.on("message:text", async (ctx) => {
    const replyTo = ctx.message.reply_to_message?.message_id
    if (!replyTo) return
    const ap = await store.getApprovalByPromptMessage(replyTo)
    if (!ap) return
    if (Date.now() > ap.exp) {
      await ctx.reply("⌛ That request already expired.")
      return
    }
    const saved = await store.setAnswerText(ap.id, ctx.message.text, Date.now())
    await ctx.reply(saved ? "✅ Got your reply." : "Already answered.")
  })

  // Inline-button taps — route through the structured callback handler.
  bot.on("callback_query:data", async (ctx) => {
    const action = parseCallback(ctx.callbackQuery.data)
    const outcome = await runCallback(action, {
      store,
      github: githubFor(env),
      now: () => Date.now(),
    })
    await ctx.answerCallbackQuery(
      outcome.answer ? { text: outcome.answer } : undefined,
    )
    if (outcome.editText !== undefined) {
      // Keep the original question visible — APPEND the result + drop the buttons,
      // rather than replacing the message text.
      const msg = ctx.callbackQuery.message
      const orig = msg && "text" in msg ? msg.text : ""
      const next = orig ? `${orig}\n\n${outcome.editText}` : outcome.editText
      await ctx.editMessageText(next).catch(() => {})
    } else if (outcome.stripButtons) {
      await ctx.editMessageReplyMarkup().catch(() => {})
    }
    if (outcome.reply) {
      await ctx.reply(
        outcome.reply,
        outcome.replyMarkup
          ? { reply_markup: buildButtons(outcome.replyMarkup) }
          : undefined,
      )
    }
    // ✍️ Custom: open a force_reply prompt + retarget the approval's reply-matching to it.
    if (outcome.forceReply) {
      const sent = await ctx.reply(outcome.forceReply.prompt, {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: "Type your answer",
        },
      })
      await store.setPromptMessage(
        outcome.forceReply.approvalId,
        sent.message_id,
      )
    }
  })

  return bot
}
