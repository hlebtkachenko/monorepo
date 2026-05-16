import type { ReactNode } from "react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { auth } from "@workspace/auth/server"
import { getTranslations } from "@workspace/i18n/server"
import { AUTH_ASIDE_LOGOS } from "@workspace/shared"
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
import { Marquee } from "@workspace/ui/components/marquee"
import { WalletMinimal } from "@workspace/ui/lib/icons"

import { ArrowLeft } from "@workspace/ui/lib/icons"

import { isDevPreview } from "@/lib/dev-preview"

import { LanguagePicker } from "../../_components/language-picker"

/**
 * Layout for signed-in MFA flows (currently just `/auth/mfa/setup`).
 *
 * The MFA setup route is reached by an already-authenticated user from
 * their profile, so the chrome differs from the unauthenticated default
 * group:
 *   - Right header slot shows the `AccountMenu` (email + sign-out)
 *     instead of "Return to afframe.com".
 *   - There is no header-link override mechanism — the page-specific
 *     back link is rendered inside the form column by each page.
 */
export default async function AuthMfaLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  const preview = await isDevPreview()
  if (!session && !preview) {
    redirect("/auth/login")
  }

  const tBrand = await getTranslations("brand")
  const tLayout = await getTranslations("layout.footer")
  const tAside = await getTranslations("auth.aside")
  const tMfa = await getTranslations("auth.mfa.setup")
  const brand = tBrand("name")
  const year = new Date().getFullYear()

  return (
    <AuthShell>
      <AuthShellLeft>
        <AuthShellHeader>
          <div className="flex w-full items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
              <WalletMinimal
                className="size-5 text-foreground"
                aria-hidden="true"
              />
              {brand}
            </span>
            <Link
              href="/workspace/profile"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {tMfa("backToProfile")}
            </Link>
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
                href="#"
                className="transition-colors hover:text-foreground"
              >
                {tLayout("privacy")}
              </Link>
              <Link
                href="#"
                className="transition-colors hover:text-foreground"
              >
                {tLayout("terms")}
              </Link>
              <Link
                href="#"
                className="transition-colors hover:text-foreground"
              >
                {tLayout("status")}
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
            <div className="w-full overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
              <Marquee
                pauseOnHover
                repeat={3}
                className="mt-2 [--duration:32s] [--gap:2.25rem]"
                aria-label="Companies using Afframe"
              >
                {AUTH_ASIDE_LOGOS.map((name) => (
                  <span
                    key={name}
                    className="font-heading text-sm font-semibold tracking-tight opacity-70"
                  >
                    {name}
                  </span>
                ))}
              </Marquee>
            </div>
          </AuthAsideBottom>
        </AuthAside>
      </AuthShellAside>
    </AuthShell>
  )
}
