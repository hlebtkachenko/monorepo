import {
  BRAND_APP_URL,
  BRAND_NAME,
  BRAND_SUPPORT_EMAIL,
} from "@workspace/ui/brand-assets/constants"
import { escapeHtml } from "./html"
import type { EmailMessage } from "./transport"

/**
 * Framework-free transactional email templates (no React Email, no MJML).
 *
 * All emails share one cross-client shell (`renderShell`): table-based layout,
 * fully inlined styles, a hosted PNG brand mark (inline SVG is stripped by
 * Gmail/Outlook), a padded-cell button Outlook's Word engine renders, a fluid
 * card that reflows on mobile, and a footer. Every template also sets
 * `replyTo` to the support inbox so replies to the no-reply sender reach a human.
 */

// Email-safe font stack — inlined on every text element.
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// Shared inline text styles.
const H1_STYLE =
  "margin:0 0 12px 0; font-size:22px; line-height:1.3; font-weight:600; color:#111111;"
const BODY_STYLE =
  "margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#374151;"
const BODY_LAST_STYLE =
  "margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#374151;"

/**
 * The shared shell: brand mark + content rows + footer, wrapped in the
 * cross-client scaffold. `contentHtml` is a run of `<tr>` rows (build them with
 * `headingRow` / `buttonRow` / `fallbackRow`). `brandName` defaults to the
 * framework-free BRAND_NAME; the invite injects its i18n-resolved value.
 */
function renderShell(opts: {
  to: string
  subject: string
  preheader: string
  contentHtml: string
  text: string
  brandName?: string
}): EmailMessage {
  const brand = escapeHtml(opts.brandName ?? BRAND_NAME)
  const logoUrl = escapeHtml(`${BRAND_APP_URL}/icon-512.png`)
  const loginUrl = escapeHtml(`${BRAND_APP_URL}/auth/login`)
  const year = new Date().getFullYear()
  // Logo cell left padding is 23px (= 32 - 9): the icon-512 PNG carries ~9px of
  // transparent inset at 48px, so 23 aligns the visible mark with the 32px
  // content edge used by every other row. Not a typo — do not "fix" to 32.
  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0; padding:0; width:100%; background-color:#ffffff;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#ffffff;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px;">
          <tr>
            <td style="padding:32px 32px 0 23px;">
              <img src="${logoUrl}" width="48" height="48" alt="${brand}" style="display:block; width:48px; height:48px; border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic;">
            </td>
          </tr>
${opts.contentHtml}
          <tr>
            <td style="padding:8px 32px 32px 32px; font-family:${FONT_STACK};">
              <p style="margin:0; font-size:13px; line-height:1.6; color:#6b7280;">&copy; ${year} ${brand}. <a href="${loginUrl}" style="color:#111111; text-decoration:underline;">Login instead</a></p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`

  // Reply-To to the support inbox is stamped here, so every email rendered
  // through the shell carries it — a builder cannot forget it.
  return {
    to: opts.to,
    subject: opts.subject,
    html,
    text: opts.text,
    replyTo: BRAND_SUPPORT_EMAIL,
  }
}

/** Heading + intro paragraph rows. `innerHtml` is the `<h1>` + `<p>` markup. */
function headingRow(innerHtml: string): string {
  return `          <tr>
            <td style="padding:24px 32px 0 32px; font-family:${FONT_STACK};">
${innerHtml}
            </td>
          </tr>`
}

/** Bulletproof padded-cell CTA button (neutral #111). */
function buttonRow(url: string, label: string): string {
  return `          <tr>
            <td style="padding:0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#111111" style="border-radius:6px;">
                    <a href="${escapeHtml(url)}" style="display:inline-block; padding:12px 28px; font-family:${FONT_STACK}; font-size:15px; line-height:1; font-weight:600; color:#ffffff; text-decoration:none; border-radius:6px;">${escapeHtml(label)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
}

/** Paste-the-link fallback + optional trailing note (e.g. "if you didn't request"). */
function fallbackRow(url: string, note?: string): string {
  const noteHtml = note
    ? `
              <p style="margin:12px 0 0 0; font-size:13px; line-height:1.6; color:#6b7280;">${escapeHtml(note)}</p>`
    : ""
  return `          <tr>
            <td style="padding:24px 32px 20px 32px; font-family:${FONT_STACK};">
              <p style="margin:0 0 8px 0; font-size:13px; line-height:1.6; color:#6b7280;">If the button doesn't work, paste this link into your browser:</p>
              <p style="margin:0; font-size:13px; line-height:1.6; word-break:break-all;"><a href="${escapeHtml(url)}" style="color:#111111;">${escapeHtml(url)}</a></p>${noteHtml}
            </td>
          </tr>`
}

export function passwordResetEmail(input: {
  to: string
  url: string
}): EmailMessage {
  const subject = "Reset your password"
  const content = [
    headingRow(
      `              <h1 style="${H1_STYLE}">Reset your password</h1>
              <p style="${BODY_LAST_STYLE}">Click the button below to set a new password. The link expires in one hour.</p>`,
    ),
    buttonRow(input.url, "Reset password"),
    fallbackRow(
      input.url,
      "If you did not request this, you can ignore the message.",
    ),
  ].join("\n")
  const text = `Reset your password: ${input.url}\n\nIf you did not request this, ignore the message.`
  return renderShell({
    to: input.to,
    subject,
    preheader: "Reset your password — the link expires in one hour.",
    contentHtml: content,
    text,
  })
}

export function verifyEmailEmail(input: {
  to: string
  url: string
}): EmailMessage {
  const subject = "Confirm your email"
  const content = [
    headingRow(
      `              <h1 style="${H1_STYLE}">Confirm your email</h1>
              <p style="${BODY_LAST_STYLE}">Click the button below to confirm this email address.</p>`,
    ),
    buttonRow(input.url, "Confirm email"),
    fallbackRow(input.url),
  ].join("\n")
  const text = `Confirm your email: ${input.url}`
  return renderShell({
    to: input.to,
    subject,
    preheader: "Confirm your email address.",
    contentHtml: content,
    text,
  })
}

export function magicLinkEmail(input: {
  to: string
  url: string
}): EmailMessage {
  const subject = "Your sign-in link"
  const content = [
    headingRow(
      `              <h1 style="${H1_STYLE}">Sign in to your account</h1>
              <p style="${BODY_LAST_STYLE}">Click the button below to sign in. The link expires in 10 minutes.</p>`,
    ),
    buttonRow(input.url, "Sign in"),
    fallbackRow(
      input.url,
      "If you did not request this, you can ignore the message.",
    ),
  ].join("\n")
  const text = `Sign in to your account: ${input.url}\n\nThe link expires in 10 minutes. If you did not request this, ignore the message.`
  return renderShell({
    to: input.to,
    subject,
    preheader: "Sign in to your account — the link expires in 10 minutes.",
    contentHtml: content,
    text,
  })
}

/**
 * Organization invitation email. Invites are org-scoped: the heading names the
 * workspace, the body names the organization (legal name) plus inviter.
 */
export function inviteEmail(input: {
  to: string
  url: string
  brandName: string
  /** Workspace display name — the heading ("Join <workspace>"). */
  workspaceName: string
  /** Organization legal name — the entity being joined. */
  organizationName: string
  inviterName: string | null
  inviterEmail: string | null
  role: string
  expiresAt: Date
}): EmailMessage {
  const subject = `You've been invited to ${input.organizationName} on ${input.brandName}`
  // Prague-local expiry — the product is Czech-first. Intl emits the correct
  // seasonal abbreviation automatically (CEST in summer, CET in winter).
  const expiresHuman = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(input.expiresAt)
  const brandName = escapeHtml(input.brandName)
  const workspaceName = escapeHtml(input.workspaceName)
  const organizationName = escapeHtml(input.organizationName)
  const role = escapeHtml(input.role)
  const inviterPlain = input.inviterName
    ? `${input.inviterName}${input.inviterEmail ? ` (${input.inviterEmail})` : ""}`
    : null
  const inviterEmailHtml =
    input.inviterName && input.inviterEmail
      ? ` (${escapeHtml(input.inviterEmail)})`
      : ""
  const inviterLine = input.inviterName
    ? `<strong>${escapeHtml(input.inviterName)}</strong>${inviterEmailHtml} invited you to`
    : "You've been invited to"

  const content = [
    headingRow(
      `              <h1 style="${H1_STYLE}">Join ${workspaceName}</h1>
              <p style="${BODY_STYLE}">${inviterLine} <strong>${organizationName}</strong> on <strong>${brandName}</strong> as <strong>${role}</strong>.</p>
              <p style="${BODY_LAST_STYLE}">Click the button below to accept. The link expires ${escapeHtml(expiresHuman)} and can be used only once.</p>`,
    ),
    buttonRow(input.url, "Accept invitation"),
    fallbackRow(input.url),
  ].join("\n")

  const text =
    `${inviterPlain ? `${inviterPlain} invited you` : "You've been invited"} to ${input.organizationName} on ${input.brandName} as ${input.role}.\n\n` +
    `Accept the invitation: ${input.url}\n\n` +
    `The link expires ${expiresHuman} and can be used only once.`
  return renderShell({
    to: input.to,
    subject,
    preheader: `${inviterPlain ? `${inviterPlain} invited you` : "You've been invited"} to join ${input.organizationName} as ${input.role}.`,
    contentHtml: content,
    text,
    brandName: input.brandName,
  })
}
