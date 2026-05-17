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
- Four built-in HTML templates: password reset, email verification, magic link, and workspace invite.

## Environment variables

| Variable          | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `EMAIL_TRANSPORT` | Force a backend: `console`, `resend`, or `ses` |
| `RESEND_API_KEY`  | Resend API key                                 |
| `AWS_REGION`      | AWS region for SES v2                          |
| `EMAIL_FROM`      | Sender address (required for real delivery)    |
