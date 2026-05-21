import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@workspace/auth/server"

import {
  createBugIssue,
  LinearNotConfiguredError,
  LinearRequestError,
} from "@/lib/linear"

/**
 * POST /api/feedback/bug
 *
 * Receives a structured bug-report payload from the in-app right-click
 * dialog (`@workspace/ui/blocks/app-context-menu`). Auth-gated — only
 * signed-in users may file issues. Converts the JSON payload into a
 * Markdown body and posts to Linear's
 * "Support tickets from app.afframe.com" project.
 *
 * If LINEAR_API_KEY is not set, returns 503 so the client UI can fall
 * back to clipboard-only behavior.
 */
export const dynamic = "force-dynamic"

const RectSchema = z
  .object({
    top: z.number(),
    left: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .nullable()

const ElementSchema = z.object({
  tag: z.string().max(64),
  data_slot: z.string().max(128).nullable(),
  role: z.string().max(64).nullable(),
  id: z.string().max(128).nullable(),
  classes: z.string().max(500).nullable(),
  text: z.string().max(1000),
  dom_path: z.string().max(2000),
  bounding_rect: RectSchema,
})

const SelectionSchema = z.object({
  text: z.string().max(4000).nullable(),
  html: z.string().max(4000).nullable(),
  rect: RectSchema,
})

const PageSchema = z.object({
  url: z.string().max(2048),
  pathname: z.string().max(512),
  title: z.string().max(500).nullable(),
  locale: z.string().max(16).nullable(),
  theme: z.enum(["light", "dark", "system"]).nullable(),
  referrer: z.string().max(2048).nullable(),
})

const ScopeSchema = z.object({
  org_slug: z.string().max(64).optional(),
  user: z
    .object({
      id: z.string().max(64).optional(),
      email: z.string().max(320).optional(),
    })
    .optional(),
})

const SurroundingSchema = z.object({
  nearest_heading: z.string().max(300).nullable(),
  inferred_block: z.string().max(128).nullable(),
  nearby_text: z.string().max(2000),
})

const ViewportSchema = z.object({
  width: z.number().int().min(0).max(20000),
  height: z.number().int().min(0).max(20000),
  scroll_y: z.number().int().min(0).max(1000000),
  device_pixel_ratio: z.number().min(0).max(8),
})

const ClientSchema = z.object({
  user_agent: z.string().max(800),
  platform: z.string().max(128).nullable(),
  language: z.string().max(32).nullable(),
  timezone: z.string().max(64).nullable(),
  online: z.boolean(),
  prefers_dark: z.boolean(),
})

const BugReportSchema = z.object({
  kind: z.literal("bug.report"),
  version: z.literal(1),
  timestamp: z.string().max(64),
  // Aligned with the public Send-feedback API enum.
  type: z.enum(["bug", "request", "issue", "question"]),
  // Aligned with the public API field; required, 1-4000 chars.
  message: z.string().min(1).max(4000),
  // Optional reply-to email; same cap (254) as the public API.
  email: z.string().email().max(254).nullable(),
  auto_title: z.string().max(300),
  page: PageSchema,
  scope: ScopeSchema,
  element: ElementSchema,
  selection: SelectionSchema,
  surrounding: SurroundingSchema,
  viewport: ViewportSchema,
  client: ClientSchema,
})

type BugReport = z.infer<typeof BugReportSchema>

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  const parsed = BugReportSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const payload = parsed.data

  try {
    const issue = await createBugIssue({
      title: payload.auto_title,
      description: renderDescription(payload, {
        actorId: session.user.id,
        actorEmail: session.user.email,
      }),
    })
    return NextResponse.json({
      id: issue.id,
      identifier: issue.identifier,
      url: issue.url,
    })
  } catch (err) {
    if (err instanceof LinearNotConfiguredError) {
      console.warn("[bug-report] Linear not configured")
      return NextResponse.json(
        { error: "linear-not-configured" },
        { status: 503 },
      )
    }
    if (err instanceof LinearRequestError) {
      console.error("[bug-report] Linear request failed", err.message)
      return NextResponse.json({ error: "linear-failed" }, { status: 502 })
    }
    console.error("[bug-report] unexpected error", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

const TYPE_LABELS: Record<BugReport["type"], string> = {
  bug: "Bug",
  request: "Feature request",
  issue: "Process / UX issue",
  question: "Question",
}

function renderDescription(
  payload: BugReport,
  actor: { actorId: string; actorEmail: string | null | undefined },
): string {
  const { element, selection, page, viewport, surrounding, client, scope } =
    payload
  const replyEmail = payload.email ?? actor.actorEmail ?? actor.actorId

  const lines: string[] = [
    `**Type:** ${TYPE_LABELS[payload.type]}`,
    "",
    "### What the reporter said",
    "",
    payload.message ? quoteBlock(payload.message) : "_(no message)_",
    "",
    "### Where",
    "",
    `- **URL:** ${page.url}`,
    `- **Pathname:** \`${page.pathname}\``,
    page.title ? `- **Page title:** ${page.title}` : "",
    scope.org_slug ? `- **Org slug:** \`${scope.org_slug}\`` : "",
    `- **Reporter:** ${actor.actorEmail ?? actor.actorId}`,
    payload.email && payload.email !== actor.actorEmail
      ? `- **Reply email:** ${payload.email}`
      : `- **Reply email:** ${replyEmail}`,
    `- **Viewport:** ${viewport.width}×${viewport.height} (DPR ${viewport.device_pixel_ratio}, scroll ${viewport.scroll_y}px)`,
    page.theme ? `- **Theme:** ${page.theme}` : "",
    page.locale ? `- **Locale:** ${page.locale}` : "",
    client.timezone ? `- **Timezone:** ${client.timezone}` : "",
    `- **Online:** ${client.online ? "yes" : "no"}`,
    `- **Captured:** ${payload.timestamp}`,
    "",
    "### Element",
    "",
    `- **Tag:** \`${describeElement(element)}\``,
    element.dom_path ? `- **DOM path:** \`${element.dom_path}\`` : "",
    surrounding.inferred_block
      ? `- **Block (inferred):** \`${surrounding.inferred_block}\``
      : "",
    surrounding.nearest_heading
      ? `- **Nearest heading:** ${surrounding.nearest_heading}`
      : "",
    element.text ? `- **Element text:** ${quote(element.text)}` : "",
    element.bounding_rect
      ? `- **Rect:** ${element.bounding_rect.width}×${element.bounding_rect.height} @ ${element.bounding_rect.left},${element.bounding_rect.top}`
      : "",
    "",
  ]

  if (selection.text) {
    lines.push("### Selection", "", quoteBlock(selection.text), "")
  }

  if (surrounding.nearby_text) {
    lines.push("### Nearby text", "", quoteBlock(surrounding.nearby_text), "")
  }

  lines.push(
    "### Client",
    "",
    "```",
    `User-Agent: ${client.user_agent}`,
    client.platform ? `Platform: ${client.platform}` : "",
    client.language ? `Language: ${client.language}` : "",
    "```",
    "",
    "<details><summary>Raw payload (JSON)</summary>",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "</details>",
  )

  return lines.filter((line) => line !== "").join("\n")
}

function describeElement(el: BugReport["element"]): string {
  const attrs: string[] = []
  if (el.data_slot) attrs.push(`data-slot="${el.data_slot}"`)
  if (el.role) attrs.push(`role="${el.role}"`)
  if (el.id) attrs.push(`id="${el.id}"`)
  return `<${el.tag}${attrs.length ? " " + attrs.join(" ") : ""}>`
}

function quote(text: string): string {
  return `> ${text.replace(/\n+/g, " ")}`
}

function quoteBlock(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n")
}
