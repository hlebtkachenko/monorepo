import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  accountDangerOtpEmail,
  betaClientTaskEmail,
  betaDocumentAttentionEmail,
  betaPeriodPublishedEmail,
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

describe("account danger OTP email", () => {
  it("contains the one-time code and the requested action", () => {
    const message = accountDangerOtpEmail({
      to: "owner@example.com",
      code: "123456",
      purpose: "delete_account",
    })

    expect(message.subject).toBe("Confirm a sensitive account action")
    expect(message.html).toContain("123456")
    expect(message.text).toContain("delete your account")
    expect(message.text).toContain("expires in 10 minutes")
    // Migrated onto the shared shell during merge — verify it routes through it.
    expect(message.replyTo).toBe("support@afframe.com")
    expect(message.html).toContain("https://app.afframe.com/icon-512.png")
  })
})

describe("beta portal notifications", () => {
  const BETA_URL = "https://beta.afframe.com/acme-sro/dokumenty"

  it("betaDocumentAttentionEmail names the doklad and quotes the office message", () => {
    const m = betaDocumentAttentionEmail({
      to: "owner@example.com",
      organizationName: "Acme s.r.o.",
      filename: "faktura-2026-08.pdf",
      officeMessage: "Chybí variabilní symbol.",
      url: BETA_URL,
    })
    expect(m.subject).toBe("Doklad „faktura-2026-08.pdf“ vyžaduje pozornost")
    expect(m.html).toContain("faktura-2026-08.pdf")
    expect(m.html).toContain("Acme s.r.o.")
    expect(m.html).toContain("Chybí variabilní symbol.")
    expect(m.html).toContain("Otevřít Dokumenty")
    expect(m.replyTo).toBe("support@afframe.com")
  })

  it("betaClientTaskEmail names the task and the due date", () => {
    const m = betaClientTaskEmail({
      to: "admin@example.com",
      organizationName: "Acme s.r.o.",
      title: "Nahrát bankovní výpis",
      dueDateLabel: "25.03.2026",
      url: BETA_URL,
    })
    expect(m.subject).toBe("Nový úkol: Nahrát bankovní výpis")
    expect(m.html).toContain("Nahrát bankovní výpis")
    expect(m.html).toContain("25.03.2026")
    expect(m.html).toContain("Zobrazit úkoly")
  })

  it("betaPeriodPublishedEmail names the dataset and the period", () => {
    const m = betaPeriodPublishedEmail({
      to: "member@example.com",
      organizationName: "Acme s.r.o.",
      datasetLabel: "Rozvaha",
      periodLabel: "07/2026",
      url: BETA_URL,
    })
    expect(m.subject).toBe("Nová data ve výkazech: Rozvaha za 07/2026")
    expect(m.html).toContain("Rozvaha")
    expect(m.html).toContain("07/2026")
    expect(m.html).toContain("Zobrazit výkazy")
  })

  it("overrides the shell's login link to the beta portal, not the main app", () => {
    const m = betaDocumentAttentionEmail({
      to: "owner@example.com",
      organizationName: "Acme s.r.o.",
      filename: "f.pdf",
      officeMessage: "x",
      url: BETA_URL,
    })
    expect(m.html).toContain("https://beta.afframe.com/sign-in")
    // The brand mark still hosts on the main app's domain (beta has no
    // separate one) — only the LOGIN link is overridden.
    expect(m.html).not.toContain("https://app.afframe.com/auth/login")
  })

  it("still shares the cross-client shell (brand mark, footer, reply-to)", () => {
    const m = betaClientTaskEmail({
      to: "admin@example.com",
      organizationName: "Acme s.r.o.",
      title: "x",
      dueDateLabel: "01.01.2026",
      url: BETA_URL,
    })
    expect(m.html).toContain("https://app.afframe.com/icon-512.png")
    expect(m.html).toContain("max-width:560px")
    expect(m.html).toContain("<!--[if mso]>")
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
