import { Resend } from "resend"
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2"

/**
 * Outbound email transport.
 *
 * Picks the live backend at module load. Order:
 *   1. `EMAIL_TRANSPORT=console|resend|ses` — explicit override, wins
 *      over auto-detection (useful for forcing console in CI tests
 *      even when keys leak from the shell).
 *   2. RESEND_API_KEY set                   -> Resend
 *   3. AWS_REGION set                       -> SES v2 (assumes task IAM
 *      grants ses:SendEmail; works in dev too if local AWS creds exist)
 *   4. neither                              -> ConsoleTransport (logs
 *      payload, never delivers)
 *
 * `EMAIL_FROM` is the From address. If absent, the transport falls back
 * to `no-reply@localhost`, which is fine for the console transport but
 * breaks delivery against Resend/SES — those reject unverified domains.
 *
 * In dev, every sent message is also pushed into a small in-memory
 * outbox (see `recordOutbox` below) so the dev API route can surface
 * password-reset / invite URLs without scraping stdout.
 */

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text?: string
}

export interface EmailTransport {
  readonly kind: "resend" | "ses" | "console"
  send(message: EmailMessage): Promise<void>
}

const FROM_FALLBACK = "no-reply@localhost"

export interface OutboxEntry {
  at: string
  from: string
  to: string
  subject: string
  text?: string
  /** First http(s) URL extracted from the plain-text body, if any. */
  url?: string
}

const MAX_OUTBOX = 50

// Stash the ring buffer on globalThis so every Next.js bundle (server
// actions, route handlers, RSC) that imports @workspace/email points at
// the same array. Without this, Turbopack ships a fresh copy of the
// module per bundle group and sends recorded by the server-action bundle
// never reach the route-handler bundle's readDevOutbox().
const OUTBOX: OutboxEntry[] = ((
  globalThis as unknown as { __APP_EMAIL_OUTBOX?: OutboxEntry[] }
).__APP_EMAIL_OUTBOX ??= [])

function extractUrl(text?: string): string | undefined {
  if (!text) return undefined
  const m = text.match(/https?:\/\/\S+/)
  return m?.[0]
}

// Strip CR/LF so a user-controlled field (recipient, subject) can't forge extra
// lines in the console transport's log output (log injection). For CodeQL to
// accept this as a sanitizer the newline replace must use the empty string AND
// an UNQUANTIFIED pattern \u2014 a `+` on the char class defeats its replaces(s, "")
// modelling (verified against the js/log-injection query with the CodeQL CLI).
// The global flag still removes every CR/LF, so behaviour is unchanged.
function stripLineBreaks(value: string): string {
  return value.replace(/[\r\n]/g, "")
}

function recordOutbox(entry: OutboxEntry): void {
  OUTBOX.push(entry)
  if (OUTBOX.length > MAX_OUTBOX) OUTBOX.shift()
}

/** Read the dev outbox (most recent first). Empty in production. */
export function readDevOutbox(): OutboxEntry[] {
  return OUTBOX.slice().reverse()
}

class ConsoleTransport implements EmailTransport {
  readonly kind = "console" as const
  async send(message: EmailMessage): Promise<void> {
    const from = process.env.EMAIL_FROM ?? FROM_FALLBACK
    const url = extractUrl(message.text)
    recordOutbox({
      at: new Date().toISOString(),
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      url,
    })

    console.log(
      `\n┌─ email:console ───────────────────────────────────────────\n` +
        `│ to:      ${stripLineBreaks(message.to)}\n` +
        `│ from:    ${stripLineBreaks(from)}\n` +
        `│ subject: ${stripLineBreaks(message.subject)}\n` +
        (url ? `│ link:    ${stripLineBreaks(url)}\n` : "") +
        `└───────────────────────────────────────────────────────────\n`,
    )
  }
}

class ResendTransport implements EmailTransport {
  readonly kind = "resend" as const
  private client: Resend
  constructor(apiKey: string) {
    this.client = new Resend(apiKey)
  }
  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: process.env.EMAIL_FROM ?? FROM_FALLBACK,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
    if (error) {
      throw new Error(`resend.send failed: ${error.name} ${error.message}`)
    }
  }
}

class SesTransport implements EmailTransport {
  readonly kind = "ses" as const
  private client: SESv2Client
  constructor(region: string) {
    this.client = new SESv2Client({ region })
  }
  async send(message: EmailMessage): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: process.env.EMAIL_FROM ?? FROM_FALLBACK,
        Destination: { ToAddresses: [message.to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: message.html, Charset: "UTF-8" },
              Text: message.text
                ? { Data: message.text, Charset: "UTF-8" }
                : undefined,
            },
          },
        },
      }),
    )
  }
}

function pickTransport(): EmailTransport {
  const override = process.env.EMAIL_TRANSPORT?.toLowerCase()
  if (override === "console") return new ConsoleTransport()
  if (override === "resend") {
    const key = process.env.RESEND_API_KEY
    if (!key) {
      throw new Error("EMAIL_TRANSPORT=resend but RESEND_API_KEY is not set")
    }
    return new ResendTransport(key)
  }
  if (override === "ses") {
    const region = process.env.AWS_REGION
    if (!region) {
      throw new Error("EMAIL_TRANSPORT=ses but AWS_REGION is not set")
    }
    return new SesTransport(region)
  }
  // No explicit override. In dev (NODE_ENV !== 'production') always
  // default to the console transport — local AWS creds / RESEND_API_KEY
  // leaking from the shell shouldn't accidentally fire real email from
  // a developer's laptop, and the dev outbox at /api/dev/outbox is the
  // intended observability surface. Set EMAIL_TRANSPORT=ses|resend to
  // exercise a real backend locally when you actually want delivery.
  if (process.env.NODE_ENV !== "production") return new ConsoleTransport()

  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) return new ResendTransport(resendKey)
  const region = process.env.AWS_REGION
  if (region) return new SesTransport(region)
  return new ConsoleTransport()
}

let _transport: EmailTransport | null = null

export function getTransport(): EmailTransport {
  if (!_transport) {
    _transport = pickTransport()

    console.log(`[email] transport=${_transport.kind}`)
  }
  return _transport
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await getTransport().send(message)
}
