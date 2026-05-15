import type { ReactNode } from "react"
import Link from "next/link"
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
import { ArrowUpRight, WalletMinimal } from "@workspace/ui/lib/icons"

import { LanguagePicker } from "../../_components/language-picker"

/**
 * Default auth chrome — photo aside.
 *
 * Wraps login, signup welcome, forgot-password, reset-password, invite.
 * Owns the header (brand left + return-to-marketing-site CTA right),
 * footer (legal links + language picker), and aside (headline + quote +
 * placeholder text-logo marquee). Pages render only their form column
 * into `children`.
 *
 * Tracked in docs/plans/AUTH-OUTSTANDING.md (blocked on typography
 * merge): button/input pixel sizes (G1+G2), dual aside scrims (G3),
 * top/bottom anchored aside layout (G4), bg-left image position (G6).
 * The structural composition (header row, footer with legal+lang,
 * aside with quote+marquee, no magic-link CTA) is in place now.
 */
export default async function AuthDefaultLayout({
  children,
}: {
  children: ReactNode
}) {
  const tBrand = await getTranslations("brand")
  const tLayout = await getTranslations("layout.footer")
  const tAside = await getTranslations("auth.aside")
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
              href={tBrand("returnLinkHref")}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowUpRight className="size-4" aria-hidden="true" />
              {tBrand("returnLinkLabel")}
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
