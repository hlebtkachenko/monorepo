/**
 * @workspace/ui/brand-assets — single source of truth for the Afframe
 * brand surface that consumers in apps/web, apps/admin, apps/api (and
 * future packages/email, packages/pdf) share.
 *
 *   <Logo>                       — 4 variants × 9 tones
 *   <BrandName>, <BrandTagline>  — i18n-localized brand text
 *   getBrandText()               — server-side resolver
 *   BRAND_SUPPORT_EMAIL, ...     — non-localized constants
 *
 * Brand color tokens live in packages/ui/src/styles/globals.css
 * (--brand-primary-light/dark, --brand-admin-light/dark,
 * --brand-mono-light/dark). Favicon raster set is regenerated from those
 * tokens via scripts/build-favicons.py.
 *
 * Logo SVG sources live in ./source/, extracted into typed path modules
 * under ./paths/ by scripts/build-logo-paths.mjs.
 */

export { Logo } from "./logo"
export type { LogoProps, LogoVariant, LogoTone } from "./logo"

export { SidekickMark } from "./sidekick-mark"

export * from "./text"
export * from "./constants"
export * from "./tokens"
export * from "./version"

// Server-side helpers live in a separate entry so client bundles don't
// drag in next-intl/server. Import from "@workspace/ui/brand-assets/server".
