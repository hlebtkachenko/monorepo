# @workspace/email

Outbound email transport with automatic backend selection (Resend, AWS SES v2, or console) and a dev outbox for local development.

## Entry point

```ts
import {
  sendEmail,
  getTransport,
  readDevOutbox,
  type EmailMessage,
  type EmailTransport,
  type OutboxEntry,
  passwordResetEmail,
  verifyEmailEmail,
  magicLinkEmail,
  inviteEmail,
} from "@workspace/email"
```

## What it does

- `sendEmail(message)` — dispatch a message via the active transport.
- `getTransport()` — lazy singleton; backend picked in priority order: `EMAIL_TRANSPORT` env var override → `RESEND_API_KEY` → `AWS_REGION` → console fallback.
- In non-production environments the console transport always wins (to avoid accidental delivery from developer machines) and every send is also recorded in an in-memory ring buffer accessible via `readDevOutbox()`.
- Four built-in templates (password reset, email verification, magic link, organization invite), all rendered through one shared cross-client shell in `templates.ts`.

## Authoring a new email

Full decisions + cross-client rationale + env/preview reference:
[`docs/specs/TRANSACTIONAL-EMAILS.md`](../../docs/specs/TRANSACTIONAL-EMAILS.md).

All transactional emails live in `src/templates.ts` and share `renderShell`. Do not
hand-roll a new `<html>` document or reinvent the layout.

```ts
export function welcomeEmail(input: { to: string; url: string }): EmailMessage {
  const subject = "Welcome"
  const content = [
    headingRow(
      `<h1 style="${H1_STYLE}">Welcome</h1>
       <p style="${BODY_LAST_STYLE}">Finish setting up your account.</p>`,
    ),
    buttonRow(input.url, "Get started"),
    fallbackRow(input.url),
  ].join("\n")
  const text = `Welcome — finish setup: ${input.url}`
  return renderShell({
    to: input.to,
    subject,
    preheader: "Welcome — finish setup.",
    contentHtml: content,
    text,
  })
}
```

Rules (a guard test in `templates.test.ts` enforces the first):

- Return `renderShell(...)` — never a bespoke document. It carries the table layout, inlined
  styles, fluid-mobile card + Outlook MSO ghost, hosted brand-mark PNG, footer, and stamps
  the support `replyTo` (From is no-reply) — so you never build the `EmailMessage` by hand.
- Brand values only from `@workspace/ui/brand-assets/constants` (`BRAND_*`, `BRAND_APP_URL`).
  Logo is the hosted PNG (`${BRAND_APP_URL}/icon-512.png`) — never inline SVG (Gmail/Outlook
  strip it).
- Inline styles + tables only. No `<style>` layout, no flexbox/grid.
- Add a test asserting the shell markers + `replyTo`, and export the builder from `index.ts`.

## Environment variables

| Variable          | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `EMAIL_TRANSPORT` | Force a backend: `console`, `resend`, or `ses` |
| `RESEND_API_KEY`  | Resend API key                                 |
| `AWS_REGION`      | AWS region for SES v2                          |
| `EMAIL_FROM`      | Sender address (required for real delivery)    |
