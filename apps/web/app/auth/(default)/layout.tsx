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
import { WalletMinimal } from "@workspace/ui/lib/icons"

import { LanguagePicker } from "../../_components/language-picker"
import { AuthHeaderLinkProvider } from "./_components/auth-header-link"
import { AuthHeaderRight } from "./_components/auth-header-right"

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
    <AuthHeaderLinkProvider>
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
    </AuthHeaderLinkProvider>
  )
}
