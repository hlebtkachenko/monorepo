import type { EmailMessage } from "./transport"

/**
 * Minimal HTML email templates.
 *
 * Intentionally framework-free: no React Email, no MJML. When the design
 * system wants richer chrome, swap these for React Email components that
 * render to HTML strings at build/send time.
 */

const baseStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; color: #111; }
  a.button { display: inline-block; background: #111; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; }
  .container { max-width: 540px; margin: 0 auto; padding: 24px; }
  .muted { color: #6b7280; font-size: 13px; }
`

function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    ${bodyHtml}
  </div>
</body>
</html>`
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function passwordResetEmail(input: {
  to: string
  url: string
}): EmailMessage {
  const subject = "Reset your password"
  const html = wrap(
    subject,
    `
    <h2>Reset your password</h2>
    <p>Click the button below to set a new password. The link expires in one hour.</p>
    <p><a class="button" href="${escapeHtml(input.url)}">Reset password</a></p>
    <p class="muted">If you did not request this, you can ignore the message.</p>
    `,
  )
  const text = `Reset your password: ${input.url}\n\nIf you did not request this, ignore the message.`
  return { to: input.to, subject, html, text }
}

export function verifyEmailEmail(input: {
  to: string
  url: string
}): EmailMessage {
  const subject = "Confirm your email"
  const html = wrap(
    subject,
    `
    <h2>Confirm your email</h2>
    <p>Click the button below to confirm this email address.</p>
    <p><a class="button" href="${escapeHtml(input.url)}">Confirm email</a></p>
    `,
  )
  const text = `Confirm your email: ${input.url}`
  return { to: input.to, subject, html, text }
}

export function inviteEmail(input: {
  to: string
  url: string
  brandName: string
  workspaceName: string
  inviterName: string | null
  role: string
  expiresAt: Date
}): EmailMessage {
  const subject = `You've been invited to ${input.workspaceName} on ${input.brandName}`
  const expiresHuman = input.expiresAt.toUTCString()
  const inviterLine = input.inviterName
    ? `<strong>${escapeHtml(input.inviterName)}</strong> invited you to`
    : "You've been invited to"
  const html = wrap(
    subject,
    `
    <h2>${escapeHtml(`Join ${input.workspaceName}`)}</h2>
    <p>${inviterLine} <strong>${escapeHtml(input.workspaceName)}</strong> on
       <strong>${escapeHtml(input.brandName)}</strong> as
       <strong>${escapeHtml(input.role)}</strong>.</p>
    <p>Click the button below to accept. The link expires
       ${escapeHtml(expiresHuman)} and can be used only once.</p>
    <p><a class="button" href="${escapeHtml(input.url)}">Accept invitation</a></p>
    <p class="muted">If the button doesn't work, paste this link into your browser:</p>
    <p class="muted"><a href="${escapeHtml(input.url)}">${escapeHtml(input.url)}</a></p>
    `,
  )
  const text =
    `${input.inviterName ? `${input.inviterName} invited you` : "You've been invited"} to ${input.workspaceName} on ${input.brandName} as ${input.role}.\n\n` +
    `Accept the invitation: ${input.url}\n\n` +
    `The link expires ${expiresHuman} and can be used only once.`
  return { to: input.to, subject, html, text }
}
