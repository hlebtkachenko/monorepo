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

/**
 * Keyboard for an auto-created/recurred issue. Row 1: Open in Linear (+ Open run / ⟳ Rerun
 * when the event carried a GitHub run). Row 2: delivery controls (Snooze 1h / Ack), keyed by
 * the SHORT Linear identifier so the callback stays under Telegram's 64-byte limit.
 */
export function buildIssueKeyboard(
  identifier: string,
  url: string,
  opts: { runId?: number; runUrl?: string } = {},
): InlineKeyboard {
  const kb = new InlineKeyboard().url(`Open ${identifier}`, url)
  if (opts.runUrl) kb.url("Open run", opts.runUrl)
  if (opts.runId) kb.text("⟳ Rerun", `rrn:${opts.runId}`)
  kb.row()
    .text("😴 Snooze 1h", `snz:${identifier}:60`)
    .text("✓ Ack", `ack:${identifier}`)
  return kb
}

/** Confirm/cancel keyboard for a gated write command, keyed by its dispatch token. */
export function buildConfirmKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Confirm", `cfm:${token}`)
    .text("✖️ Cancel", `cxl:${token}`)
}

/** One button per option for an agent approval (ask:<id>:<optionIndex>). */
export function buildAskKeyboard(
  id: string,
  options: string[],
): InlineKeyboard {
  const kb = new InlineKeyboard()
  options.forEach((label, i) => kb.text(label, `ask:${id}:${i}`).row())
  return kb
}
