"use client"

import { Badge } from "@workspace/ui/components/badge"

/**
 * Shared display helpers for a gated `tool_call_log` write — the small,
 * tool-agnostic labels and badges reused across BOTH the Records Inbox surfaces:
 * the read-only ingestion feed (`documents-inbox/*`) and the HELD-write resolve
 * queue (`inbox-resolve/*`). Kept here, neutral, so the resolve engine can live
 * next to the inbox without either surface importing the other's columns.
 *
 * Pure data-shaping + one presentational badge — no DB, no `server-only`; every
 * value is display-only (`confidence` is the decimal string "0.6300", never a
 * raw payload). Marked `"use client"` because it is only ever rendered inside
 * the client table components.
 */

const TOOL_LABELS: Record<string, string> = {
  createAccountingEvent: "Účetní případ",
  captureAccountingDocument: "Doklad",
  createAccountingPosting: "Zápis",
}

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool
}

export const TOOL_OPTIONS = Object.entries(TOOL_LABELS).map(
  ([value, label]) => ({ label, value }),
)

const ACTOR_LABELS: Record<string, string> = {
  agent: "Agent",
  user: "Uživatel",
  api_key: "API klíč",
}

export function actorLabel(actor: string): string {
  return ACTOR_LABELS[actor] ?? actor
}

/** "YYYY-MM-DD HH:MM" → "D. M. YYYY HH:MM" (display only, no Date parsing). */
export function formatCreatedAt(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/.exec(value)
  if (!match) return value
  const [, year, month, day, time] = match
  return `${Number(day)}. ${Number(month)}. ${year} ${time}`
}

/** Confidence decimal string ("0.6300") → integer percent (display only). */
function confidencePercent(confidence: string): number {
  const n = Number(confidence)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Badge tinted by the gate outcome band: below 70 % reads as risky. */
export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const percent = confidencePercent(confidence)
  return (
    <Badge
      variant="secondary"
      className={
        percent < 70
          ? "bg-destructive/10 text-destructive dark:bg-destructive/20"
          : undefined
      }
    >
      {percent} %
    </Badge>
  )
}
