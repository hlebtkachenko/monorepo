import { InlineKeyboard } from "grammy"
import type { AlertLevel, IngestPayload } from "@workspace/notify"

const LEVEL_EMOJI: Record<AlertLevel, string> = {
  info: "ℹ️",
  success: "✅",
  warn: "⚠️",
  error: "🔴",
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Render an ingest payload into a Telegram HTML message string. */
export function renderMessage(p: IngestPayload): string {
  const emoji = p.level ? `${LEVEL_EMOJI[p.level]} ` : ""
  const tag = p.source ? ` <i>[${escapeHtml(p.source)}]</i>` : ""
  return `${emoji}${escapeHtml(p.text)}${tag}`
}

/** One-tap inline keyboard from labels (label == callback data). Undefined when empty. */
export function buildKeyboard(buttons?: string[]): InlineKeyboard | undefined {
  if (!buttons || buttons.length === 0) return undefined
  const kb = new InlineKeyboard()
  for (const label of buttons) kb.text(label, label)
  return kb
}

/** Keyboard for an auto-created/recurred issue: an "Open in Linear" url button. */
export function buildIssueKeyboard(
  identifier: string,
  url: string,
): InlineKeyboard {
  return new InlineKeyboard().url(`Open ${identifier}`, url)
}
