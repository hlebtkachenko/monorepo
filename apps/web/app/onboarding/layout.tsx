import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { getTranslations } from "@workspace/i18n/server"
import { getBuildVersion, Logo } from "@workspace/ui/brand-assets"
import {
  AuthShell,
  AuthShellAside,
  AuthShellBody,
  AuthShellFooter,
  AuthShellHeader,
  AuthShellLeft,
} from "@workspace/ui/blocks/auth-shell"
import {
  AuthShellChromeAside,
  AuthShellChromeFooter,
} from "@workspace/ui/blocks/auth"

import { isDevPreview } from "@/lib/dev-preview"

import { LanguagePicker } from "../_components/language-picker"
import { AuthHeaderLinkProvider } from "../auth/(default)/_components/auth-header-link"
import { AuthHeaderRight } from "../auth/(default)/_components/auth-header-right"
import { OnboardingRoleProvider } from "./_components/onboarding-role-context"
import { WizardProgressClient } from "./_components/wizard-progress-client"
import { detectOnboardingRole } from "./_lib/role"

/**
 * Unified onboarding chrome. Both flows (owner + member) share one
 * route and one layout. Role is detected from cookies at request
 * time and seeded into a client-side context provider so step forms
 * can branch on it without a re-read.
 *
 * Routes are flat under `/onboarding/`:
 *   - profile, experience, password, done — shared
 *   - workspace, plan, team — owner-only (member visits are
 *     redirected to /done by `assertOnStep` in the page).
 *
 * The layout owns:
 *   - the AuthShell chrome (header / footer / aside)
 *   - the wizard progress meter (derived from URL + role)
 *   - the back-link slot (via AuthHeaderLinkProvider — pages can
 *     override the default "return to marketing" link with a
 *     wizard-aware "back to previous step" link).
 *
 * Pages own:
 *   - their own form + page-specific copy
 *   - the optional <AuthHeaderLinkOverride> for back-navigation.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  const ctx = await detectOnboardingRole()
  const preview = await isDevPreview()
  const resolvedCtx =
    ctx ??
    (preview ? { role: "owner" as const, email: "preview@example.com" } : null)
  if (!resolvedCtx) {
    // Neither signup-cookie nor invite-cookie present — kick to login.
    // Without one of these, the BA user can't be created at step 3, so
    // there's no path forward through the wizard.
    redirect("/auth/login?error=onboarding-session-expired")
  }

  const tBrand = await getTranslations("brand")
  const tLayout = await getTranslations("layout.footer")
  const tAside = await getTranslations("auth.aside")
  const brand = tBrand("name")

  return (
    <AuthHeaderLinkProvider>
      <OnboardingRoleProvider role={resolvedCtx.role}>
        <AuthShell>
          <AuthShellLeft>
            <AuthShellHeader>
              <div className="flex w-full items-center justify-between gap-4">
                <Logo
                  variant="horizontal"
                  tone="primary"
                  className="h-6 w-auto"
                  aria-label={brand}
                />
                <AuthHeaderRight
                  defaultHref={tBrand("returnLinkHref")}
                  defaultLabel={tBrand("returnLinkLabel")}
                />
              </div>
            </AuthShellHeader>
            <AuthShellBody>
              <div className="flex flex-col gap-8">
                <WizardProgressClient />
                {children}
              </div>
            </AuthShellBody>
            <AuthShellFooter>
              <AuthShellChromeFooter
                brand={brand}
                version={getBuildVersion()}
                size="xs"
                labels={{
                  privacy: tLayout("privacy"),
                  terms: tLayout("terms"),
                  status: tLayout("status"),
                }}
              >
                <LanguagePicker />
              </AuthShellChromeFooter>
            </AuthShellFooter>
          </AuthShellLeft>
          <AuthShellAside>
            <AuthShellChromeAside
              image="/auth/aside-bg.webp"
              headline={tAside("headline")}
              subtitle={tAside("subtitle", { brand })}
              quote={{
                text: tAside("quote.text"),
                author: tAside("quote.author"),
                role: tAside("quote.role"),
              }}
              partnersLabel={tAside("partnersLabel", { brand })}
            />
          </AuthShellAside>
        </AuthShell>
      </OnboardingRoleProvider>
    </AuthHeaderLinkProvider>
  )
}
