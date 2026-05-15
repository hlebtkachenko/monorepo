import type { ReactNode } from "react"
import Link from "next/link"
import { getTranslations } from "@workspace/i18n/server"
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
  AuthAsideHeadline,
  AuthAsideQuote,
  AuthAsideSubtitle,
} from "@workspace/ui/blocks/auth-aside"

import { LanguagePicker } from "../../_components/language-picker"

/**
 * Member onboarding chrome — tone aside, 4-step variant. Sibling of
 * (owner)/layout.tsx; parent `onboarding/layout.tsx` is a passthrough so
 * neither inherits the other's chrome.
 *
 * Same chrome composition as owner: brand mark in header, legal links
 * + language picker in footer. Outstanding pieces tracked in
 * docs/plans/AUTH-OUTSTANDING.md.
 */
export default async function MemberOnboardingLayout({
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
          <span className="text-base font-semibold tracking-tight">
            {brand}
          </span>
        </AuthShellHeader>
        <AuthShellBody>{children}</AuthShellBody>
        <AuthShellFooter>
          <div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs">
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
        <AuthAside variant="tone">
          <AuthAsideHeadline>{tAside("headline")}</AuthAsideHeadline>
          <AuthAsideSubtitle>{tAside("subtitle", { brand })}</AuthAsideSubtitle>
          <AuthAsideQuote
            author={tAside("quote.author")}
            role={tAside("quote.role")}
          >
            {tAside("quote.text")}
          </AuthAsideQuote>
        </AuthAside>
      </AuthShellAside>
    </AuthShell>
  )
}
