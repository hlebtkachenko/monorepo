import { randomBytes } from "node:crypto"
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from "@nestjs/common"
import { CreateFeedbackRequestSchema } from "@workspace/shared/api"
import { ValidationError } from "@workspace/shared/errors"
import { ApiCreatedResponse, ApiOperation, ApiTags } from "@nestjs/swagger"
import { sendEmail } from "@workspace/email"
import type {
  CreateFeedbackRequest,
  CreateFeedbackResponse,
  FeedbackContext,
} from "@workspace/shared/api"
import { notifierFromEnv } from "@workspace/notify"

/**
 * `POST /v1/feedback` — partner feedback ingestion.
 *
 * Dispatch path:
 *   1. Generate an opaque `fb_<random>` reference id.
 *   2. Email `support+feedback@afframe.com` via Resend. Gmail-style
 *      sub-addressing routes to the support inbox with an auto-applied
 *      label. The api never stores the raw feedback locally.
 *   3. If `LINEAR_API_KEY` is set, create a Linear issue in the Afframe
 *      project tagged with the feedback type. Linear is the system of
 *      record.
 *
 * Both side-effects are fire-and-forget from the request's perspective:
 * the api returns 201 as soon as the email + Linear calls have been
 * issued. A failure on either side is logged but does NOT fail the
 * request — the user already submitted, and forcing them to retry on
 * our infra outage is worse than swallowing the error and following
 * up via the logged reference id.
 *
 * Public endpoint (no API key) — anyone who can reach the API can file
 * feedback. Rate-limited by the existing api-key-throttler guard
 * (falls back to IP for unauthenticated requests).
 */

const SUPPORT_INBOX = "support+feedback@afframe.com"
const LINEAR_API = "https://api.linear.app/graphql"

// Fire-and-forget Telegram ping for every feedback; no-op when the bot env is unset.
const notifier = notifierFromEnv()

function generateReferenceId(): string {
  // 9 random bytes -> 12 base64url chars. Collision-free for any realistic
  // submission volume; the id is opaque (not used as a primary key).
  // node:crypto used directly so the symbol resolves cleanly under the
  // webpack-bundled Nest build (the global `crypto` works in plain Node
  // but webpack's externals handling can drop it).
  const b64 = randomBytes(9)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  return `fb_${b64}`
}

function buildEmail(
  body: CreateFeedbackRequest,
  referenceId: string,
): { subject: string; html: string; text: string } {
  const subject = `[Afframe feedback · ${body.type}] ${referenceId}`
  const text =
    [
      `Reference: ${referenceId}`,
      `Type: ${body.type}`,
      body.email ? `Reply-to: ${body.email}` : "Reply-to: (not provided)",
      "",
      body.message,
    ].join("\n") + renderContext(body.context)
  const html = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(
    text,
  )}</pre>`
  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Render optional in-app capture context as a Markdown block. Returns an
 * empty string when no context is present (public partner submissions),
 * so the issue/email body is unchanged for those callers.
 */
function renderContext(context: FeedbackContext | undefined): string {
  if (!context) return ""
  const { page, scope, element, selection, surrounding, viewport, client } =
    context
  const lines: string[] = []
  if (page) {
    lines.push(
      "**Where**",
      `- URL: ${page.url}`,
      `- Path: \`${page.pathname}\``,
      page.title ? `- Title: ${page.title}` : "",
      page.theme ? `- Theme: ${page.theme}` : "",
      page.locale ? `- Locale: ${page.locale}` : "",
    )
  }
  if (scope?.org_slug || scope?.reporter_email) {
    lines.push(
      scope.org_slug ? `- Org: \`${scope.org_slug}\`` : "",
      scope.reporter_email ? `- Reporter: ${scope.reporter_email}` : "",
    )
  }
  if (element) {
    lines.push(
      "",
      "**Element**",
      `- Tag: \`${element.tag}\`${element.data_slot ? ` (data-slot="${element.data_slot}")` : ""}`,
      element.dom_path ? `- DOM path: \`${element.dom_path}\`` : "",
      surrounding?.nearest_heading
        ? `- Nearest heading: ${surrounding.nearest_heading}`
        : "",
    )
  }
  if (selection?.text) {
    lines.push(
      "",
      "**Selection**",
      "",
      `> ${selection.text.replace(/\n+/g, " ")}`,
    )
  }
  if (viewport) {
    lines.push(
      "",
      `**Viewport:** ${viewport.width}×${viewport.height} (DPR ${viewport.device_pixel_ratio})`,
    )
  }
  if (client) {
    lines.push(
      "",
      "**Client**",
      `- User-Agent: ${client.user_agent}`,
      client.platform ? `- Platform: ${client.platform}` : "",
      client.timezone ? `- Timezone: ${client.timezone}` : "",
    )
  }
  const body = lines.filter((l) => l !== "").join("\n")
  return body ? `\n\n---\n\n${body}` : ""
}

/**
 * The full validated context as a collapsed JSON block, appended to the
 * Linear issue (NOT the support email) so triagers get the ~14 captured
 * fields `renderContext` summarizes but omits — element role/id/classes/
 * text, selection.html, surrounding.nearby_text, viewport.scroll_y, client
 * env, page.referrer — without bloating the at-a-glance Markdown header.
 * Query strings/hashes are already stripped from urls at capture time, and
 * reporter identity is server-injected, so this leaks no extra PII. Returns
 * an empty string when no context is present.
 */
function renderContextJson(context: FeedbackContext | undefined): string {
  if (!context) return ""
  return [
    "",
    "",
    "<details><summary>Full captured context (JSON)</summary>",
    "",
    "```json",
    JSON.stringify(context, null, 2),
    "```",
    "",
    "</details>",
  ].join("\n")
}

async function createLinearIssue(
  body: CreateFeedbackRequest,
  referenceId: string,
  logger: Logger,
): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY?.trim()
  const teamId = process.env.LINEAR_TEAM_ID?.trim()
  if (!apiKey || !teamId) {
    logger.warn(
      `[feedback ${referenceId}] LINEAR_API_KEY or LINEAR_TEAM_ID unset — skipping Linear issue creation`,
    )
    return
  }
  const title = `[feedback · ${body.type}] ${body.message.slice(0, 80)}${
    body.message.length > 80 ? "…" : ""
  }`
  const description =
    [
      `Reference: \`${referenceId}\``,
      `Type: **${body.type}**`,
      body.email ? `Reply-to: ${body.email}` : "Reply-to: (not provided)",
      "",
      body.message,
    ].join("\n") +
    renderContext(body.context) +
    renderContextJson(body.context)
  const mutation = `
    mutation CreateFeedback($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { id identifier } }
    }
  `
  try {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        query: mutation,
        variables: { input: { teamId, title, description } },
      }),
    })
    if (!res.ok) {
      logger.error(
        `[feedback ${referenceId}] Linear API ${res.status}: ${await res.text()}`,
      )
    }
  } catch (err) {
    logger.error(
      `[feedback ${referenceId}] Linear request failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}

@ApiTags("Feedback")
@Controller({ path: "feedback", version: "1" })
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name)

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Send feedback",
    description:
      "Submit a bug, request, issue, or question. Forwarded to " +
      "support+feedback@afframe.com and filed as a Linear issue.",
  })
  @ApiCreatedResponse({
    description: "Feedback accepted for downstream dispatch.",
  })
  async create(@Body() rawBody: unknown): Promise<CreateFeedbackResponse> {
    // Validate the body shape explicitly. The global ZodValidationPipe in
    // V1Module only fires when a controller parameter carries a
    // createZodDto class type — interfaces alone do not, so guard here.
    const parsed = CreateFeedbackRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      this.logger.warn(
        `[feedback] body rejected: ${JSON.stringify(rawBody)} issues=${JSON.stringify(parsed.error.issues)}`,
      )
      throw new ValidationError(
        `Invalid feedback payload: ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
          .join("; ")}`,
      )
    }
    const body: CreateFeedbackRequest = parsed.data
    const referenceId = generateReferenceId()
    const { subject, html, text } = buildEmail(body, referenceId)

    try {
      await sendEmail({ to: SUPPORT_INBOX, subject, html, text })
    } catch (err) {
      this.logger.error(
        `[feedback ${referenceId}] email dispatch failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
    // Linear creation is best-effort; do not block the response.
    void createLinearIssue(body, referenceId, this.logger)
    if (notifier) {
      void notifier
        .notify(`📝 New feedback ${referenceId} (${body.type})`, {
          source: "api",
        })
        .catch(() => {})
    }

    return { received: true, referenceId }
  }
}
