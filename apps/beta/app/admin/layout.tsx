import type { Metadata } from "next"
import Link from "next/link"

import { Logo } from "@workspace/ui/brand-assets"
import { Badge } from "@workspace/ui/components/badge"

import { getBetaTranslations } from "@/i18n/translations-server"
import { getBetaSession } from "@/lib/auth/session"
import { requireOffice } from "@/lib/data/scope"

import { SignOutButton } from "../_components/sign-out-button"

import { AdminTabs } from "./_components/admin-tabs"

/**
 * The office area — cross-organization, `is_staff` only (Advisor blocker B4-6).
 *
 * OUTSIDE THE PORTAL SHELL, on purpose. The `(portal)` group draws the org
 * chrome — rail, header, content panels — all of which promise a single client
 * book. /admin is above organizations: it lists all of them, and putting a
 * cross-org surface inside single-book furniture is how an office user ends up
 * reading one client's grid as another's. Its own minimal chrome instead.
 *
 * THE GATE IS `requireOffice()`, NOT A ROLE. An organization role cannot express
 * "may use the office area" — /admin is above organizations, so there is no
 * organization to hold a role in. `requireOffice()` answers 404 for everyone
 * else, including a company `admin` and including office staff whose account has
 * been deactivated, and it re-reads `app_user.is_staff` on every request so a
 * revoked flag lands on the next navigation rather than at cookie expiry.
 *
 * The layout gate is what stops a browser from SEEING /admin. It is NOT what
 * stops one from POSTING to it: a Server Action is a public endpoint that does
 * not run this layout. Every action in `_actions/` re-checks.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOffice()

  const t = await getBetaTranslations()
  const session = await getBetaSession()

  return (
    <div className="min-h-svh bg-canvas">
      <header className="border-b border-border-subtle bg-shell-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Logo variant="horizontal" className="h-5 w-auto" />
            <Badge variant="secondary">{t("app.badge")}</Badge>
          </Link>
          <span className="text-sm font-medium text-foreground">
            {t("admin.title")}
          </span>
          <div className="ms-auto flex items-center gap-3">
            {session ? (
              <span className="text-xs text-muted-foreground">
                {session.email}
              </span>
            ) : null}
            <SignOutButton />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-6 pb-3">
          <AdminTabs />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
