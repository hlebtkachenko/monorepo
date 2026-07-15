import {
  inviteEmail,
  magicLinkEmail,
  passwordResetEmail,
  verifyEmailEmail,
} from "@workspace/email/templates"

export const metadata = { title: "Emails · Debug" }

const SAMPLE_URL =
  "https://app.afframe.com/auth/invite?token=afkey-SAMPLExxxxxxxxxxxxxxxxxxxxxxxx-00000001"

/**
 * Live preview of every transactional email (@workspace/email) with sample
 * data — the in-repo replacement for ad-hoc render scripts. From + Reply-To
 * headers are applied by the transport at send time; the subject + reply-to
 * built into each message are shown above its frame. Staff-only (admin shell).
 */
const SAMPLES = [
  {
    name: "Organization invite",
    message: inviteEmail({
      to: "guest@example.com",
      url: SAMPLE_URL,
      brandName: "Afframe",
      workspaceName: "Henderson Group Workspace",
      organizationName: "BD Nehvizdy Henderson s.r.o.",
      inviterName: "Hleb Tkachenko",
      inviterEmail: "info+henderson@hapd.cz",
      role: "guest",
      expiresAt: new Date("2026-07-22T12:35:29Z"),
    }),
  },
  {
    name: "Password reset",
    message: passwordResetEmail({ to: "user@example.com", url: SAMPLE_URL }),
  },
  {
    name: "Email verification",
    message: verifyEmailEmail({ to: "user@example.com", url: SAMPLE_URL }),
  },
  {
    name: "Magic link",
    message: magicLinkEmail({ to: "user@example.com", url: SAMPLE_URL }),
  },
]

export default function EmailsDebugPage() {
  return (
    <div className="space-y-8 p-6">
      <p className="text-sm text-muted-foreground">
        Live render of every transactional email with sample data. Layout, brand
        mark, and footer come from the shared shell in{" "}
        <code>packages/email/src/templates.ts</code>. The brand mark loads from
        production, so it appears only when <code>app.afframe.com</code> is up.
      </p>

      {SAMPLES.map((sample) => (
        <section key={sample.name} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">{sample.name}</h2>
            <span className="text-xs text-muted-foreground">
              subject: “{sample.message.subject}” · reply-to:{" "}
              {sample.message.replyTo}
            </span>
          </div>
          <iframe
            title={sample.name}
            srcDoc={sample.message.html}
            className="h-[640px] w-full rounded-lg border border-border bg-white"
          />
        </section>
      ))}
    </div>
  )
}
