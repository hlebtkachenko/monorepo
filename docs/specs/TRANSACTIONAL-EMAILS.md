# Transactional Emails

How Afframe renders and sends transactional email, the decisions behind it, and
how to add a new one. Package: `@workspace/email` (`packages/email`).

## At a glance

| Concern   | Answer                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| Framework | None — framework-free HTML strings. No React Email / MJML.                       |
| Home      | All templates in `packages/email/src/templates.ts`, one shared shell.            |
| Delivery  | `sendEmail()` → Resend (prod) / SES (fallback) / console (dev).                  |
| From      | `EMAIL_FROM` bare address; the transport prepends the `BRAND_NAME` display name. |
| Reply-To  | `support@afframe.com` (`BRAND_SUPPORT_EMAIL`) on every message.                  |
| Brand     | Only from `@workspace/ui/brand-assets` SoT (`BRAND_*`, `BRAND_APP_URL`, tokens). |
| Preview   | Admin page (dev) — renders every template with sample data.                      |

## Scope — what lives here, what doesn't

The shared shell is for **user-facing** transactional email; those all live in
`templates.ts` (invite, password reset, email verification, magic link).

One email is intentionally **outside** it: the **feedback → support** notification
(`apps/api/src/v1/feedback/feedback.controller.ts`). It is an internal ops alert — a
plain monospace diagnostic dump to the support inbox, not a branded customer email —
so it does not use `renderShell`. It still goes through `sendEmail()`, sets `replyTo`
to the submitter, and shares the `escapeHtml` util from `@workspace/email` (no local
copy). New **internal** notifications may follow that pattern; every **customer-facing**
email must use the shell.

## Decisions

- **Framework-free, not React Email.** The shared shell already encodes the
  cross-client knowledge React Email's components provide (tables, inlined
  styles, MSO ghost, bulletproof button, hosted logo). React Email would be a
  DX upgrade (JSX + preview server) at the cost of a heavier dependency tree and
  rewriting every template as `.tsx`; it does not improve correctness. Revisit
  only if template count grows a lot or non-developers must edit them.
- **One shell for every email.** `renderShell` is the single source of layout.
  New emails compose content rows; they never emit their own `<html>`.
- **Cross-client first.** Verified against Gmail, Outlook (Word engine), Apple
  Mail / iOS. Consequences baked into the shell:
  - Table-based layout, all styles **inlined** (Outlook ignores `<style>`).
  - Fluid card `width:100%; max-width:560px` + an MSO ghost table so it reflows
    on mobile yet stays 560px in Outlook.
  - **Padded-cell button** (`bgcolor` + padding on the `<td>`) — Outlook renders it.
  - **Hosted PNG brand mark** (`${BRAND_APP_URL}/icon-512.png`). Inline SVG is
    stripped by Gmail/Outlook; custom `@font-face` only renders in Apple/iOS
    Mail, so the heading uses the system stack.
  - Expiry shown in **Europe/Prague** time via `Intl` (Czech-first product);
    the seasonal abbreviation (CEST/CET) is automatic.
- **From display name in code, not env.** `EMAIL_FROM` holds the bare address
  (`no-reply@afframe.com`); `resolveFrom()` prepends `BRAND_NAME` → inboxes show
  **Afframe**, not a local-part "no-reply". A full `EMAIL_FROM` ("Name <addr>")
  still overrides. So a bare prod env value renders "Afframe" once this code
  deploys — no infra/secret change required.
- **Reply-To to support.** From is no-reply; replies must reach a human, so every
  template sets `replyTo: BRAND_SUPPORT_EMAIL`.

## Authoring a new email

Add a builder to `templates.ts` that `return`s `renderShell(...)`. The shell
returns the full `EmailMessage` and stamps `replyTo` — so a builder cannot forget it:

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

Then export it from `index.ts` and add a test in `templates.test.ts`.

### Hard rules (enforced)

The guard test in `templates.test.ts` reads the source and **fails CI** if any
exported `*Email` builder does not render through `renderShell` (which is what
stamps the support Reply-To). Also:

- Return `renderShell(...)` — never a bespoke `<html>` document. Reply-To is
  stamped by the shell; do not re-build the `EmailMessage` by hand.
- Brand only from `@workspace/ui/brand-assets` (`BRAND_NAME`, `BRAND_SUPPORT_EMAIL`,
  `BRAND_APP_URL`, tokens). Never hardcode name, colour, support email, or logo.
- Logo is the hosted PNG — never inline SVG.
- Inline styles + tables only. No `<style>` layout, no flexbox/grid.
- Dynamic values (name, org, URL, expiry) are interpolated in both the HTML and
  the plaintext `text` — never hand-typed. Only static wording is literal.

## Delivery & environment

Backend is chosen at module load (`pickTransport`): `EMAIL_TRANSPORT` override →
`RESEND_API_KEY` → `AWS_REGION` → console. In dev the console transport always
wins (no accidental delivery from laptops); force a real send with
`EMAIL_TRANSPORT=resend`.

| Var               | Purpose                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `EMAIL_TRANSPORT` | `console` \| `resend` \| `ses` (Fargate sets `resend`).                                                     |
| `RESEND_API_KEY`  | Resend key. Vault `platform/{env}/resend-api-key` → SSM.                                                    |
| `EMAIL_FROM`      | Bare sender address (`no-reply@afframe.com`); display name added in code. Must be a Resend-verified domain. |
| `AWS_REGION`      | Region for the SES fallback.                                                                                |

Full env reference: [`docs/ENVIRONMENT-VARIABLES.md`](../ENVIRONMENT-VARIABLES.md).

## Preview

The admin app renders every template with sample data (dev-only). See the admin
platform email-preview page. Locally you can also render a template to a file and
open it in a browser.
