import { Resend } from "resend"
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2"

/**
 * Outbound email transport.
 *
 * Picks the live backend at module load:
 *   - RESEND_API_KEY set        -> Resend
 *   - AWS_REGION set + no Resend -> SES v2 (assumes task IAM grants ses:SendEmail)
 *   - neither                    -> ConsoleTransport (logs payload, never delivers)
 *
 * `EMAIL_FROM` is the From address. If absent, the transport falls back to
 * `no-reply@localhost`, which is fine for the console transport but breaks
 * delivery against Resend/SES — those reject unverified domains.
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

class ConsoleTransport implements EmailTransport {
  readonly kind = "console" as const
  async send(message: EmailMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[email:console]", {
      from: process.env.EMAIL_FROM ?? FROM_FALLBACK,
      to: message.to,
      subject: message.subject,
      text: message.text,
    })
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
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    return new ResendTransport(resendKey)
  }
  const region = process.env.AWS_REGION
  if (region && process.env.APP_ENV === "production") {
    return new SesTransport(region)
  }
  return new ConsoleTransport()
}

let _transport: EmailTransport | null = null

export function getTransport(): EmailTransport {
  if (!_transport) {
    _transport = pickTransport()
  }
  return _transport
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await getTransport().send(message)
}
