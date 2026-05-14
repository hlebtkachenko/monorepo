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
 * Default auth chrome — photo aside.
 *
 * Wraps login, signup welcome, forgot-password, reset-password. Composes
 * AuthShell + photo AuthAside once so every page in this route group
 * renders only its form column into `children`. Pages stay free of
 * chrome wiring.
 *
 * Outstanding pieces (tracked in docs/plans/AUTH-OUTSTANDING.md) blocked
 * on typography work:
 *   - Real brand SVG mark + horizontal header row (Return-to-afframe.com
 *     CTA on the right, currently absent)
 *   - Footer legal links (Privacy / Terms / Status) + language picker
 *   - Aside dual radial scrim, top/bottom-anchored content layout,
 *     text-logo marquee, bg-left alignment
 */
export default async function AuthDefaultLayout({
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
        <AuthAside variant="photo" image="/auth/aside-bg.jpg">
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
