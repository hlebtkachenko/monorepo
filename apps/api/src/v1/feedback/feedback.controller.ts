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
import { sendEmail, escapeHtml } from "@workspace/email"
import { BRAND_SUPPORT_EMAIL } from "@workspace/ui/brand-assets/constants"
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
 *   3. If bot issue reporting is configured, send a normalized
 *      customer-request event to the bot. The bot owns GitHub issue
 *      creation and dedup. Optional Project/Epic routing is bot deploy
 *      config, not API behavior.
 *
 * Both side-effects are best-effort from the request's perspective:
 * the api returns 201 once the email attempt has completed and the GitHub
 * issue report has been queued. A failure on either side is logged but
 * does NOT fail the
 * request — the user already submitted, and forcing them to retry on
 * our infra outage is worse than swallowing the error and following
 * up via the logged reference id.
 *
 * Public endpoint (no API key) — anyone who can reach the API can file
 * feedback. Rate-limited by the existing api-key-throttler guard
 * (falls back to IP for unauthenticated requests).
 */

// Gmail-style sub-addressing on the brand support inbox: routes to the
// same mailbox with an auto-applied "feedback" label.
const SUPPORT_INBOX = BRAND_SUPPORT_EMAIL.replace("@", "+feedback@")

// Files (or dedups into) a GitHub issue per feedback via the bot; no-op when unset.
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
 * GitHub issue (NOT the support email) so triagers get the ~14 captured
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

// Exhaustive by construction: a new FeedbackType member is a compile error here,
// not a silent fallback to some default bucket.
const FEEDBACK_ISSUE_TYPE: Record<
  CreateFeedbackRequest["type"],
  "feat" | "fix" | "docs"
> = {
  request: "feat",
  question: "docs",
  bug: "fix",
  issue: "fix",
}

function issueTypeForFeedback(
  type: CreateFeedbackRequest["type"],
): "feat" | "fix" | "docs" {
  return FEEDBACK_ISSUE_TYPE[type]
}

async function reportGitHubIssue(
  body: CreateFeedbackRequest,
  referenceId: string,
  logger: Logger,
): Promise<void> {
  if (!notifier) {
    logger.warn(`[feedback ${referenceId}] bot issue reporting not configured`)
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
  try {
    await notifier.reportIssue({
      source: "customer-request",
      title,
      body: description,
      fingerprintParts: ["feedback", referenceId],
      area: "web",
      risk: "low",
      type: issueTypeForFeedback(body.type),
      links: body.context?.page?.url
        ? [{ label: "Captured page", url: body.context.page.url }]
        : undefined,
    })
  } catch (err) {
    logger.error(
      `[feedback ${referenceId}] GitHub issue report failed: ${
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
      "support+feedback@afframe.com and filed as a GitHub issue.",
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
      // Reply-To the submitter (when given) so support can reply directly from
      // the notification instead of copying the address out of the body.
      await sendEmail({
        to: SUPPORT_INBOX,
        subject,
        html,
        text,
        replyTo: body.email ?? undefined,
      })
    } catch (err) {
      this.logger.error(
        `[feedback ${referenceId}] email dispatch failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
    // GitHub issue creation is best-effort through the bot; do not block the response.
    // reportIssue already sends the canonical (dedup/snooze-aware) Telegram echo with an
    // Open button, so no separate notify() ping — that would double-buzz every submission.
    void reportGitHubIssue(body, referenceId, this.logger)

    return { received: true, referenceId }
  }
}
