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
import { Button } from "@workspace/ui/components/button"
import { ArrowUpRight, WalletMinimal } from "@workspace/ui/lib/icons"

import { LanguagePicker } from "../_components/language-picker"

/**
 * Ungated layout for admin auth pages (login, forgot-password, reset-password).
 * Sits outside the `(gated)` route group so the workspace allowlist check
 * never runs here. Visual parity with apps/web/app/auth/(default)/layout.tsx —
 * same AuthShell two-column composition, same photo aside — with three
 * admin-specific differences:
 *   - "Admin" red wordmark next to the brand to make the surface unmistakable
 *   - Static return link to the public app (no AuthHeaderLinkProvider context;
 *     admin auth pages don't have alternate-flow links between each other)
 *   - Footer is copyright + status + language only (no privacy/terms — those
 *     are public-app concerns).
 */
export default async function AuthLayout({
  children,
}: {
  children: ReactNode
}) {
  const tBrand = await getTranslations("brand")
  const tAdmin = await getTranslations("admin")
  const tAside = await getTranslations("admin.auth.aside")
  const tFooter = await getTranslations("layout.footer")
  const brand = tBrand("name")
  const year = new Date().getFullYear()

  return (
    <AuthShell>
      <AuthShellLeft>
        <AuthShellHeader>
          <div className="flex w-full items-center justify-between gap-4">
            <span className="inline-flex items-baseline gap-2 text-base font-semibold tracking-tight">
              <WalletMinimal
                className="size-5 self-center text-foreground"
                aria-hidden="true"
              />
              {brand}
              <span className="text-red-500">{tAdmin("wordmark")}</span>
            </span>
            <Button asChild variant="ghost" size="sm">
              <Link
                href={tAdmin("auth.returnLinkHref")}
                className="inline-flex items-center gap-1.5"
              >
                {tAdmin("auth.returnLinkLabel")}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </AuthShellHeader>
        <AuthShellBody>{children}</AuthShellBody>
        <AuthShellFooter>
          <div className="flex w-full flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              © {year} {brand}
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
        <AuthAside variant="photo" image="/auth/aside-bg.jpg" bgAlign="left">
          <AuthAsideTop>
            <AuthAsideHeadline>{tAside("headline")}</AuthAsideHeadline>
            <AuthAsideSubtitle>
              {tAside("subtitle", { brand })}
            </AuthAsideSubtitle>
          </AuthAsideTop>
          <AuthAsideBottom>
            <AuthAsideQuote
              author={tAside("quote.author")}
              role={tAside("quote.role")}
            >
              {tAside("quote.text")}
            </AuthAsideQuote>
          </AuthAsideBottom>
        </AuthAside>
      </AuthShellAside>
    </AuthShell>
  )
}
