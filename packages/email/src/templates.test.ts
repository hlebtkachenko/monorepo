import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  inviteEmail,
  magicLinkEmail,
  passwordResetEmail,
  verifyEmailEmail,
} from "./templates"

const AUTH_TEMPLATES = [
  {
    name: "passwordReset",
    build: () =>
      passwordResetEmail({
        to: "u@example.com",
        url: "https://app.afframe.com/r?token=abc",
      }),
    subject: "Reset your password",
    cta: "Reset password",
  },
  {
    name: "verifyEmail",
    build: () =>
      verifyEmailEmail({
        to: "u@example.com",
        url: "https://app.afframe.com/v?token=abc",
      }),
    subject: "Confirm your email",
    cta: "Confirm email",
  },
  {
    name: "magicLink",
    build: () =>
      magicLinkEmail({
        to: "u@example.com",
        url: "https://app.afframe.com/m?token=abc",
      }),
    subject: "Your sign-in link",
    cta: "Sign in",
  },
] as const

describe("shared email shell", () => {
  for (const t of AUTH_TEMPLATES) {
    describe(t.name, () => {
      it("uses the shared shell: brand mark, footer, reply-to", () => {
        const m = t.build()
        expect(m.subject).toBe(t.subject)
        expect(m.replyTo).toBe("support@afframe.com")
        expect(m.html).toContain("https://app.afframe.com/icon-512.png")
        expect(m.html).toContain("https://app.afframe.com/auth/login")
        expect(m.html).toContain("Login instead")
        expect(m.html).toContain(`&copy; ${new Date().getFullYear()} Afframe`)
        expect(m.html).toContain(t.cta)
        // fluid card + Outlook ghost table = cross-client layout.
        expect(m.html).toContain("max-width:560px")
        expect(m.html).toContain("<!--[if mso]>")
      })
    })
  }
})

describe("inviteEmail", () => {
  const build = (over?: Partial<Parameters<typeof inviteEmail>[0]>) =>
    inviteEmail({
      to: "guest@example.com",
      url: "https://app.afframe.com/auth/invite?token=afkey-x",
      brandName: "Afframe",
      workspaceName: "Henderson Group Workspace",
      organizationName: "BD Nehvizdy Henderson s.r.o.",
      inviterName: "Hleb Tkachenko",
      inviterEmail: "info+henderson@hapd.cz",
      role: "guest",
      expiresAt: new Date("2026-07-22T12:35:29Z"),
      ...over,
    })

  it("heads with the workspace, bodies the organization + inviter email", () => {
    const m = build()
    expect(m.html).toContain("Join Henderson Group Workspace")
    expect(m.html).toContain("BD Nehvizdy Henderson s.r.o.")
    expect(m.html).toContain("info+henderson@hapd.cz")
    expect(m.replyTo).toBe("support@afframe.com")
  })

  it("shows the expiry in Prague time with the seasonal abbreviation", () => {
    const m = build()
    // 12:35:29 UTC on 2026-07-22 -> 14:35:29 CEST (summer).
    expect(m.html).toContain("14:35:29 CEST")
    expect(m.html).not.toContain("GMT")
  })

  it("degrades gracefully without an inviter", () => {
    const m = build({ inviterName: null, inviterEmail: null })
    expect(m.html).toContain("You've been invited to")
  })
})

// Convention guard: any future *Email builder an agent adds MUST render through
// the shared shell (which stamps the support Reply-To — so routing through it is
// what we assert). Reads the source so a template that hand-rolls its own HTML
// fails CI. Matches sync + async declarations. See AGENTS.md "Transactional Emails".
describe("authoring convention guard", () => {
  const src = readFileSync(
    fileURLToPath(new URL("./templates.ts", import.meta.url)),
    "utf8",
  )
  const builders = src
    .split(/export (?:async )?function /)
    .slice(1)
    .filter((chunk) => /^\w+Email\s*\(/.test(chunk))

  it("finds every exported *Email builder", () => {
    expect(builders.length).toBeGreaterThanOrEqual(4)
  })

  for (const chunk of builders) {
    const name = /^(\w+Email)/.exec(chunk)?.[1] ?? "unknown"
    it(`${name} renders through renderShell`, () => {
      expect(chunk).toContain("renderShell(")
    })
  }
})
