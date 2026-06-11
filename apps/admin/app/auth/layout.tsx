import type { ReactNode } from "react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"

import {
  AuthShell,
  AuthShellAside,
  AuthShellBody,
  AuthShellFooter,
  AuthShellHeader,
  AuthShellLeft,
} from "@workspace/ui/blocks/auth-shell"
import {
  AuthAside,
  AuthAsideBottom,
  AuthAsideHeadline,
  AuthAsideQuote,
  AuthAsideSubtitle,
  AuthAsideTop,
} from "@workspace/ui/blocks/auth-aside"
import { getBuildVersion, Logo } from "@workspace/ui/brand-assets"

import { LanguagePicker } from "../_components/language-picker"
import { AuthHeaderLinkProvider } from "./_components/auth-header-link"
import { AuthHeaderRight } from "./_components/auth-header-right"

/**
 * Ungated layout for admin auth pages (login, forgot-password, reset-password).
 * Sits outside the `(gated)` route group so the workspace allowlist check
 * never runs here.
 *
 * Composition mirrors apps/web/app/auth/(default)/layout.tsx — same AuthShell
 * two-column shell, same AuthHeaderLinkProvider + AuthHeaderRight so the
 * forms can override the header-right link per flow (e.g. password step
 * shows "Use a different email", forgot-password shows "Back to sign in").
 * Same aside copy (headline + subtitle from auth.aside.* — shared with web).
 *
 * Three admin-specific differences from web:
 *   - "Admin" red wordmark next to the brand to make the surface unmistakable
 *   - Aside QUOTE only is admin-flavoured (admin.auth.aside.quote.*); headline
 *     + subtitle stay identical to web (auth.aside.headline / subtitle)
 *   - Footer is copyright + status + language only (no privacy/terms — those
 *     are public-app concerns)
 */
export default async function AuthLayout({
  children,
}: {
  children: ReactNode
}) {
  const tBrand = await getTranslations("brand")
  const tAdmin = await getTranslations("admin")
  const tAside = await getTranslations("auth.aside")
  const tAdminQuote = await getTranslations("admin.auth.aside.quote")
  const tFooter = await getTranslations("layout.footer")
  const brand = tBrand("name")
  const year = new Date().getFullYear()

  return (
    <AuthHeaderLinkProvider>
      <AuthShell>
        <AuthShellLeft>
          <AuthShellHeader>
            <div className="flex w-full items-center justify-between gap-4">
              <Logo
                variant="horizontal"
                tone="admin"
                className="h-6 w-auto"
                aria-label={brand}
              />
              <AuthHeaderRight
                defaultHref={tBrand("returnLinkHref")}
                defaultLabel={tBrand("returnLinkLabel")}
              />
            </div>
          </AuthShellHeader>
          <AuthShellBody>{children}</AuthShellBody>
          <AuthShellFooter>
            <div className="flex w-full flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                © {year} {brand}. {getBuildVersion()}
              </span>
              <div className="flex items-center gap-4">
                <Link
                  href={tAdmin("auth.statusHref")}
                  className="transition-colors hover:text-foreground"
                >
                  {tFooter("status")}
                </Link>
                <LanguagePicker />
              </div>
            </div>
          </AuthShellFooter>
        </AuthShellLeft>
        <AuthShellAside>
          <AuthAside variant="photo" image="/auth/aside-bg.webp" bgAlign="left">
            <AuthAsideTop>
              <AuthAsideHeadline>{tAside("headline")}</AuthAsideHeadline>
              <AuthAsideSubtitle>
                {tAside("subtitle", { brand })}
              </AuthAsideSubtitle>
            </AuthAsideTop>
            <AuthAsideBottom>
              <AuthAsideQuote
                author={tAdminQuote("author")}
                role={tAdminQuote("role")}
              >
                {tAdminQuote("text")}
              </AuthAsideQuote>
            </AuthAsideBottom>
          </AuthAside>
        </AuthShellAside>
      </AuthShell>
    </AuthHeaderLinkProvider>
  )
}
