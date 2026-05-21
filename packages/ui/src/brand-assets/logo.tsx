import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import {
  type LogoPathRole,
  type LogoPathSet,
  type LogoTone,
  type LogoToneExplicit,
  type LogoToneSugar,
  type LogoVariant,
} from "./logo-types"
import { HORIZONTAL_PATHS } from "./paths/horizontal"
import { LOGOMARK_PATHS } from "./paths/logomark"
import { STACKED_PATHS } from "./paths/stacked"
import { WORDMARK_PATHS } from "./paths/wordmark"

const PATH_SETS: Record<LogoVariant, LogoPathSet> = {
  horizontal: HORIZONTAL_PATHS,
  stacked: STACKED_PATHS,
  logomark: LOGOMARK_PATHS,
  wordmark: WORDMARK_PATHS,
}

/**
 * For each explicit tone, the brand-token-driven CSS color value used for
 * each path role. Driven via inline `style.fill` so the SVG paints
 * correctly even outside a Tailwind-processed context (Storybook, email
 * preview, server-rendered PDF) — the `var(--brand-*)` reference still
 * resolves wherever `globals.css` is loaded.
 */
const TONE_FILLS: Record<LogoToneExplicit, Record<LogoPathRole, string>> = {
  "primary-light": {
    mark: "var(--brand-primary-light)",
    text: "var(--brand-mono-dark)",
  },
  "primary-dark": {
    mark: "var(--brand-primary-dark)",
    text: "var(--brand-mono-light)",
  },
  "admin-light": {
    mark: "var(--brand-admin-light)",
    text: "var(--brand-mono-dark)",
  },
  "admin-dark": {
    mark: "var(--brand-admin-dark)",
    text: "var(--brand-mono-light)",
  },
  "mono-light": {
    mark: "var(--brand-mono-light)",
    text: "var(--brand-mono-light)",
  },
  "mono-dark": {
    mark: "var(--brand-mono-dark)",
    text: "var(--brand-mono-dark)",
  },
}

const SUGAR_PAIRS: Record<LogoToneSugar, [LogoToneExplicit, LogoToneExplicit]> =
  {
    primary: ["primary-light", "primary-dark"],
    admin: ["admin-light", "admin-dark"],
    mono: ["mono-dark", "mono-light"],
  }

function isSugar(tone: LogoTone): tone is LogoToneSugar {
  return tone === "primary" || tone === "admin" || tone === "mono"
}

interface LogoProps extends Omit<React.SVGProps<SVGSVGElement>, "fill"> {
  variant?: LogoVariant
  tone?: LogoTone
}

/**
 * Brand logo. Four variants × nine tones. Adaptive sugar tones
 * (`primary`, `admin`, `mono`) flip with the `.dark` class on a parent;
 * the six explicit tones force a fixed colorway regardless of theme.
 *
 * @example
 *   <Logo />                                          // horizontal + primary adaptive
 *   <Logo variant="logomark" tone="admin" />
 *   <Logo variant="stacked" tone="mono-light" />      // forced white, e.g. on emerald hero
 *   <Logo variant="wordmark" tone="primary-dark" />   // forced mint regardless of theme
 */
function Logo({
  variant = "horizontal",
  tone = "primary",
  className,
  ...rest
}: LogoProps) {
  if (isSugar(tone)) {
    const [light, dark] = SUGAR_PAIRS[tone]
    return (
      <>
        <LogoExplicit
          variant={variant}
          tone={light}
          className={cn("dark:hidden", className)}
          {...rest}
        />
        <LogoExplicit
          variant={variant}
          tone={dark}
          className={cn("hidden dark:block", className)}
          {...rest}
        />
      </>
    )
  }
  return (
    <LogoExplicit
      variant={variant}
      tone={tone}
      className={className}
      {...rest}
    />
  )
}

interface LogoExplicitProps extends Omit<
  React.SVGProps<SVGSVGElement>,
  "fill"
> {
  variant: LogoVariant
  tone: LogoToneExplicit
}

function LogoExplicit({
  variant,
  tone,
  className,
  ...rest
}: LogoExplicitProps) {
  const { viewBox, paths } = PATH_SETS[variant]
  const fills = TONE_FILLS[tone]
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      fill="none"
      data-slot="logo"
      data-variant={variant}
      data-tone={tone}
      className={className}
      {...rest}
    >
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={fills[p.role]} />
      ))}
    </svg>
  )
}

export { Logo }
export type { LogoProps, LogoVariant, LogoTone }
