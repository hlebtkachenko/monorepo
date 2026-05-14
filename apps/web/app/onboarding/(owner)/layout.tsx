import type { ReactNode } from "react"
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

/**
 * Owner onboarding chrome — tone aside.
 *
 * Wraps the 7-step owner wizard (profile, experience, password,
 * workspace, plan, team, done). Each step page renders `<WizardProgress
 * current=N total=7 />` plus its own form-column body; this layout owns
 * the brand mark, footer, and aside.
 *
 * Outstanding (docs/plans/AUTH-OUTSTANDING.md): real brand SVG, header
 * horizontal row with secondary CTA, language picker + legal links in
 * footer, design-faithful aside (dual scrim, text-logo marquee,
 * bg-left alignment).
 */
export default async function OwnerOnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  const tBrand = await getTranslations("brand")
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
          <span>
            © {year} {brand}
          </span>
        </AuthShellFooter>
      </AuthShellLeft>
      <AuthShellAside>
        <AuthAside variant="tone">
          <AuthAsideHeadline>{tAside("headline")}</AuthAsideHeadline>
          <AuthAsideSubtitle>{tAside("subtitle")}</AuthAsideSubtitle>
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
