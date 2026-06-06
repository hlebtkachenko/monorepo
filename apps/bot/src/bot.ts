import { Bot } from "grammy"
import type { Env } from "./env.js"
import { isAllowedUser } from "./auth.js"
import { READ_COMMANDS } from "./commands.js"
import { parseCommand, randomToken, WRITE_COMMANDS } from "./dispatch.js"
import { parseCallback, runCallback } from "./callbacks.js"
import { buildConfirmKeyboard, escapeHtml } from "./format.js"
import { createStore } from "./state/store.js"
import { createGitHubClient, repoOf } from "./github.js"
import { emitIssue } from "./emit.js"
import type { IssueEvent } from "./issues/types.js"

function githubFor(env: Env) {
  return env.GITHUB_DISPATCH_TOKEN
    ? createGitHubClient(env.GITHUB_DISPATCH_TOKEN, repoOf(env))
    : null
}

/** Build a grammY bot: allowlist guard, read commands, confirm-gated write commands, /issue, taps. */
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

  for (const [name, handler] of Object.entries(READ_COMMANDS)) {
    bot.command(name, async (ctx) => {
      await ctx.reply(await handler(env, ctx.match ?? ""))
    })
  }

  // Write commands: validate -> persist a pending dispatch -> ask for a confirm tap.
  // Nothing fires until the owner presses Confirm (the callback router claims it once).
  for (const name of WRITE_COMMANDS) {
    bot.command(name, async (ctx) => {
      const { plan, error } = parseCommand(name, ctx.match ?? "")
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
      await ctx.editMessageText(outcome.editText).catch(() => {})
    } else if (outcome.stripButtons) {
      await ctx.editMessageReplyMarkup().catch(() => {})
    }
    if (outcome.reply) await ctx.reply(outcome.reply)
  })

  return bot
}
