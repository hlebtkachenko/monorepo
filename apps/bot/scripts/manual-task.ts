// Notify Hleb of a MANUAL task on his phone via Telegram, while autonomous work continues.
// Run: pnpm exec tsx apps/bot/scripts/manual-task.ts --title "..." --needed "..." --why "..." [--link "..."]
// Reads BOT_TOKEN + TELEGRAM_USER_ID from apps/bot/.dev.vars (gitignored). Never throws — a
// Telegram outage must not fail the surrounding work.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const envPath = join(here, "..", ".dev.vars")

function readVar(name: string): string | undefined {
  try {
    const txt = readFileSync(envPath, "utf8")
    return (txt.match(new RegExp(`^${name}=(.*)$`, "m")) ?? [])[1]?.trim()
  } catch {
    return undefined
  }
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

async function main(): Promise<void> {
  const token = readVar("BOT_TOKEN")
  const chatId = readVar("TELEGRAM_USER_ID")
  if (!token || !chatId) {
    console.error(
      "manual-task: BOT_TOKEN / TELEGRAM_USER_ID missing in apps/bot/.dev.vars",
    )
    return
  }
  const title = arg("--title") ?? "Manual task"
  const needed = arg("--needed") ?? ""
  const why = arg("--why") ?? ""
  const link = arg("--link")

  const text =
    `🙋 <b>Manual task</b>\n<b>${esc(title)}</b>\n` +
    (needed ? `Needed: ${esc(needed)}\n` : "") +
    (why ? `Why manual: ${esc(why)}\n` : "") +
    (link ? `→ ${esc(link)}` : "")

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: Number(chatId),
          parse_mode: "HTML",
          disable_web_page_preview: true,
          text,
        }),
      },
    )
    console.error(
      res.ok ? "manual-task: sent" : `manual-task: telegram HTTP ${res.status}`,
    )
  } catch (err) {
    console.error("manual-task: send failed (non-fatal):", err)
  }
}

void main()
