import type { ReactNode } from "react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { auth } from "@workspace/auth/server"
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

  return (
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
          <AuthShellChromeFooter
            brand={brand}
            version={getBuildVersion()}
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
  )
}
