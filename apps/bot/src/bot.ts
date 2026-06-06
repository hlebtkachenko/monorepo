import { Bot } from "grammy"
import type { Env } from "./env.js"
import { isAllowedUser } from "./auth.js"
import { READ_COMMANDS, GATED_COMMANDS } from "./commands.js"

/** Build a grammY bot wired with the allowlist guard, read commands, gated stubs, and tap handling. */
export function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN)
  const allowed = Number(env.TELEGRAM_USER_ID)

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
      await ctx.reply(await handler(env))
    })
  }

  for (const name of GATED_COMMANDS) {
    bot.command(name, async (ctx) => {
      await ctx.reply(
        `🔒 /${name} is gated. Not wired to real infrastructure in this local experiment.\n` +
          `In prod this triggers the matching GitHub workflow_dispatch behind a confirm button.`,
      )
    })
  }

  // Button taps. MVP: owner already verified by the guard — ack, strip buttons, echo the choice.
  bot.on("callback_query:data", async (ctx) => {
    const choice = ctx.callbackQuery.data
    await ctx.answerCallbackQuery()
    await ctx.editMessageReplyMarkup()
    await ctx.reply(`✅ You chose: ${choice}`)
  })

  return bot
}
