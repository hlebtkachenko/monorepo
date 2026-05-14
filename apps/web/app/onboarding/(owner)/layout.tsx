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
 * Owner onboarding chrome — tone aside. Wraps the 7-step owner wizard.
 *
 * Header carries the brand mark only — no "return to marketing site"
 * CTA mid-wizard would lose unsaved progress. Footer mirrors the auth
 * layout: legal links + language picker. Pages render their progress
 * meter + form body via WizardProgress + their own content.
 *
 * Outstanding (docs/plans/AUTH-OUTSTANDING.md): button/input pixel
 * sizes (G1+G2), aside dual scrim (G3), top/bottom anchored layout
 * (G4), text-logo marquee placement variant on tone-aside (G5),
 * bg-left (G6) — all blocked on typography merge.
 */
export default async function OwnerOnboardingLayout({
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
