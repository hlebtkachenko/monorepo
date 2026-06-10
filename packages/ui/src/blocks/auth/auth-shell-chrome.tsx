import type { ReactNode } from "react"

import {
  BRAND_PRIVACY_URL,
  BRAND_STATUS_URL,
  BRAND_TERMS_URL,
  PARTNER_PLACEHOLDER_NAMES,
} from "@workspace/ui/brand-assets"
import {
  AuthAside,
  AuthAsideBottom,
  AuthAsideHeadline,
  AuthAsideQuote,
  AuthAsideSubtitle,
  AuthAsideTop,
} from "@workspace/ui/blocks/auth-aside"
import { Marquee } from "@workspace/ui/components/marquee"
import { cn } from "@workspace/ui/lib/utils"

/**
 * AuthShellChrome — the shared chrome of every auth + onboarding screen,
 * previously copy-pasted across four apps/web layouts/pages:
 *
 *   - `AuthShellChromeFooter` renders inside `<AuthShellFooter>`: the
 *     © line + build version, the Privacy / Terms / Status links, and a
 *     trailing slot for the app's LanguagePicker.
 *   - `AuthShellChromeAside` renders inside `<AuthShellAside>`: the photo
 *     AuthAside with headline, subtitle, customer quote, and the partner
 *     logo marquee.
 *
 * Both are presentational and server-component-safe: all localized strings
 * arrive resolved via props (same convention as the auth-form blocks), so
 * the block stays decoupled from next-intl and Next.js.
 */

export interface AuthShellChromeFooterLabels {
  privacy: string
  terms: string
  status: string
}

export interface AuthShellChromeFooterProps {
  /** Localized brand name for the © line. */
  brand: string
  /** Build version string (pass `getBuildVersion()` from the server). */
  version: string
  /** Localized link labels (`layout.footer.*`). */
  labels: AuthShellChromeFooterLabels
  /** Footer text size — auth screens use `sm`, onboarding uses `xs`. */
  size?: "sm" | "xs"
  /** Trailing slot after the links — the app's LanguagePicker. */
  children?: ReactNode
}

const FOOTER_LINK_CLASS = "transition-colors hover:text-foreground"

export function AuthShellChromeFooter({
  brand,
  version,
  labels,
  size = "sm",
  children,
}: AuthShellChromeFooterProps) {
  const year = new Date().getFullYear()
  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-between gap-3",
        size === "xs" ? "text-xs" : "text-sm",
      )}
    >
      <span>
        © {year} {brand}. {version}
      </span>
      <div className="flex items-center gap-4">
        {/* The Privacy/Terms marketing pages don't exist upstream yet — these
            links 404 until the launch-checklist GDPR item (publish Privacy +
            ToS) closes. The hrefs are the canonical BRAND_* constants so
            nothing needs re-wiring when the pages go live. */}
        <a href={BRAND_PRIVACY_URL} className={FOOTER_LINK_CLASS}>
          {labels.privacy}
        </a>
        <a href={BRAND_TERMS_URL} className={FOOTER_LINK_CLASS}>
          {labels.terms}
        </a>
        <a href={BRAND_STATUS_URL} className={FOOTER_LINK_CLASS}>
          {labels.status}
        </a>
        {children}
      </div>
    </div>
  )
}

export interface AuthShellChromeAsideProps {
  /** Background photo URL (apps pass their /auth/aside-bg asset). */
  image: string
  /** Localized aside headline (`auth.aside.headline`). */
  headline: string
  /** Localized aside subtitle, brand already interpolated. */
  subtitle: string
  /** Customer quote block (`auth.aside.quote.*`). */
  quote: { text: string; author: string; role: string }
  /** Accessible label for the partner marquee, brand already interpolated. */
  partnersLabel: string
}

export function AuthShellChromeAside({
  image,
  headline,
  subtitle,
  quote,
  partnersLabel,
}: AuthShellChromeAsideProps) {
  return (
    <AuthAside variant="photo" image={image} bgAlign="left">
      <AuthAsideTop>
        <AuthAsideHeadline>{headline}</AuthAsideHeadline>
        <AuthAsideSubtitle>{subtitle}</AuthAsideSubtitle>
      </AuthAsideTop>
      <AuthAsideBottom>
        <AuthAsideQuote author={quote.author} role={quote.role}>
          {quote.text}
        </AuthAsideQuote>
        <div className="w-full overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
          <Marquee
            pauseOnHover
            repeat={3}
            className="mt-2 [--duration:32s] [--gap:2.25rem]"
            aria-label={partnersLabel}
          >
            {PARTNER_PLACEHOLDER_NAMES.map((name) => (
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
  )
}
