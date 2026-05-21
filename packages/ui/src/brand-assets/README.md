# @workspace/ui/brand-assets

Single source of truth for the Afframe brand surface. Every consumer of brand identity — logo, product name, tagline, legal info, support emails, marketing URLs, social handles — goes through here. Edit one place, every app updates.

## Entry points

```ts
// Client + isomorphic helpers
import {
  // Logo SVG component
  Logo,
  type LogoProps,
  type LogoVariant, // "horizontal" | "stacked" | "logomark" | "wordmark"
  type LogoTone, // 6 explicit + 3 adaptive sugar = 9 tones

  // Brand text (i18n-localized)
  BrandName,
  BrandTagline,
  BrandShortDescription,
  BrandDescription,
  BrandElevatorPitch,
  BrandMission,
  BrandVision,
  BrandValueProp,
  BrandLegalName,
  BrandLegalAddress,
  BrandMailingAddress,
  BrandVatId,
  BrandRegistrationId,
  BrandCopyrightHolder,
  BrandOgTitle,
  BrandOgDescription,
  BrandMetaKeywords,
  BrandReturnLinkLabel,
  BrandReturnLinkHref,

  // Non-localized constants
  BRAND_SUPPORT_EMAIL,
  BRAND_SALES_EMAIL,
  BRAND_BILLING_EMAIL,
  BRAND_LEGAL_EMAIL,
  BRAND_PRIVACY_EMAIL,
  BRAND_SECURITY_EMAIL,
  BRAND_NOREPLY_EMAIL,
  BRAND_MARKETING_URL,
  BRAND_APP_URL,
  BRAND_ADMIN_URL,
  BRAND_API_URL,
  BRAND_STATUS_URL,
  BRAND_DOCS_URL,
  BRAND_CHANGELOG_URL,
  BRAND_BLOG_URL,
  BRAND_PRIVACY_URL,
  BRAND_TERMS_URL,
  BRAND_COOKIES_URL,
  BRAND_LINKEDIN_URL,
  BRAND_FACEBOOK_URL,
  BRAND_INSTAGRAM_URL,
  BRAND_THREADS_URL,
  BRAND_YOUTUBE_URL,
  BRAND_PHONE_SUPPORT,
  BRAND_PHONE_SALES,
  BRAND_FOUNDED_YEAR,
  PARTNER_PLACEHOLDER_NAMES,

  // Build version (server-side; reads BUILD_VERSION env)
  getBuildVersion,
} from "@workspace/ui/brand-assets"

// Server-only helper for Metadata API / server actions / log lines
import { getBrandText } from "@workspace/ui/brand-assets/server"
```

## Logo

Four variants × six explicit tones × three adaptive sugar tones = every brand mark composition the apps need, callable from anywhere.

```tsx
<Logo />                                                  // horizontal + primary adaptive
<Logo variant="logomark" tone="admin" className="size-8" />
<Logo variant="stacked"  tone="mono-light" className="h-32" />    // forced white on a colored hero
<Logo variant="wordmark" tone="primary-dark" className="h-4" />   // forced mint regardless of theme
```

### Variants

| `variant`    | When to use                                                       |
| ------------ | ----------------------------------------------------------------- |
| `horizontal` | Headers, marketing nav, email signature — mark + wordmark inline  |
| `stacked`    | Splash screens, PDF cover, large hero cards — mark above wordmark |
| `logomark`   | Tiny surfaces (avatar slot, app icon, narrow mobile header)       |
| `wordmark`   | Footer, "powered by" attribution, PDF letterhead — text only      |

### Tones

Six **explicit** tones — force a fixed colorway regardless of theme:

| `tone`          | Mark color          | Text color          |
| --------------- | ------------------- | ------------------- |
| `primary-light` | emerald `#009473`   | ink `#0A1F1A`       |
| `primary-dark`  | mint `#28DCB1`      | off-white `#FFFFFF` |
| `admin-light`   | orange `#EC5011`    | ink `#0A1F1A`       |
| `admin-dark`    | orange `#EC5011`    | off-white `#FFFFFF` |
| `mono-light`    | off-white `#FFFFFF` | off-white `#FFFFFF` |
| `mono-dark`     | ink `#0A1F1A`       | ink `#0A1F1A`       |

Three **adaptive sugar** tones — flip via the `.dark` class on a parent (renders both variants with `dark:hidden` / `hidden dark:block`):

| `tone`    | Light theme     | Dark theme     |
| --------- | --------------- | -------------- |
| `primary` | `primary-light` | `primary-dark` |
| `admin`   | `admin-light`   | `admin-dark`   |
| `mono`    | `mono-dark`     | `mono-light`   |

### How the swap works

Path geometry is identical across every colorway (subpixel rounding diffs only). The component holds **one** set of paths per variant tagged with role (`mark` or `text`) and applies the tone's mark/text fills at render time. Fills resolve through `var(--brand-*)` tokens from `globals.css`, so paint stays consistent in any context where the stylesheet loads.

## Brand text

Two layers:

**Layer 1 — translatable** (`packages/i18n/src/messages/<locale>.json` under `brand.*`):

```jsx
<h1>Welcome to <BrandName />.</h1>
<p><BrandTagline /></p>
<footer><BrandCopyrightHolder /></footer>                {/* substitutes current year */}
<address><BrandLegalAddress /></address>
```

Each `<Brand*>` component reads its key via `useTranslations("brand")`. Client-tagged so they work in either tree (server-rendered first, then hydrated). For locales: edit one JSON value per language, all consumers update.

**Layer 2 — server-only resolver** for places JSX doesn't fit (Metadata API title/description, server actions, log lines):

```ts
import { getBrandText } from "@workspace/ui/brand-assets/server"

export async function generateMetadata() {
  const { name, tagline, ogTitle, ogDescription } = await getBrandText()
  return {
    title: name,
    description: tagline,
    openGraph: { title: ogTitle, description: ogDescription },
  }
}
```

`copyrightHolder` substitutes the current year automatically; override with `getBrandText({ year: 2030 })` if you need a fixed year.

## Constants

Non-localizable identifiers — emails, URLs, social handles, phone numbers. Same value across every locale. Imported as plain values:

```tsx
<a href={`mailto:${BRAND_SUPPORT_EMAIL}`}>Contact support</a>
<a href={BRAND_DOCS_URL}>Documentation</a>
```

## Build version

`getBuildVersion()` reads `process.env.BUILD_VERSION` (set at Docker image build time by `docker/metadata-action` in `_build-image.yml`) and formats it for display:

- Tagged release → `v0.2.0`
- Branch / sha build → `sha-abc1234`, `branch-main`
- Local dev (env unset) → `dev`

Server-only — the env is not in the client bundle. Used in every auth/onboarding footer so the deployed version is visible at a glance. For runtime client-side reads, use `GET /api/version` instead.

```tsx
<span>
  © {year} <BrandName />. {getBuildVersion()}
</span>
```

See `docs/conventions/RELEASES.md` for the full release flow + tag conventions.

## Placeholder pattern + production guard

Keys that don't have a real value yet ship with an explicit `<BRAND-...>` placeholder (uppercase, dash-separated). Staging deploys accept them; production deploys block on any remaining placeholder.

- Scan locally: `pnpm check:brand-placeholders` (warn-only listing)
- Production deploy enforces: `_deploy-aws.yml` runs the same script with `CHECK_BRAND_STRICT=true` when `inputs.environment == "production"` → exits 1 on any hit.

**To fill a placeholder:**

1. Edit `packages/i18n/src/messages/<locale>.json` (translatable text) or `packages/ui/src/brand-assets/constants.ts` (non-localized).
2. `pnpm check:brand-placeholders` to confirm the count drops.

## Source SVG files

```
source/
  primary-light/   horizontal.svg  stacked.svg  logomark.svg  wordmark.svg
  primary-dark/    ...
  admin/           ...
  mono-light/      ...
  mono-dark/       ...
```

Path geometry comes from the `primary-light` folder (canonical). Color folders exist for design reference + future static-file exports; the runtime `<Logo>` doesn't read them.

After updating SVG sources, regenerate the TS path modules:

```sh
node scripts/build-logo-paths.mjs
```

## Brand color tokens

Color values live in `packages/ui/src/styles/globals.css`:

```css
--brand-primary-light: #009473 --brand-primary-dark: #28dcb1
  --brand-admin-light: #ec5011 --brand-admin-dark: #ec5011
  --brand-mono-light: #ffffff --brand-mono-dark: #0a1f1a;
```

Exposed as Tailwind utilities (`text-brand-primary-light`, `bg-brand-mono-dark`, ...). Changing a hex value updates:

- Runtime UI (inline `<svg>` components, anything reading the var) — instant repaint.
- Favicon raster + adaptive SVG sets across `apps/{web,admin,api}/` — re-run `python3 scripts/build-favicons.py`.

## Related scripts

| Script                                 | What it does                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `scripts/build-favicons.py`            | Regenerate favicons from `--brand-*` tokens in `globals.css`                  |
| `scripts/build-logo-paths.mjs`         | Extract SVG path data from `source/primary-light/*.svg` into typed TS modules |
| `scripts/check-brand-placeholders.mjs` | Production-deploy guard — scans for `<BRAND-*>` tokens                        |

## What does NOT live here

| Surface                                        | Lives at                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| Favicon files (`favicon.ico`, `icon.svg`, ...) | `apps/<app>/app/` — Next.js metadata file conventions (filesystem-bound) |
| Manifest PWA icons (`icon-192.png`, ...)       | `apps/<app>/public/` — referenced by `manifest.webmanifest` URL          |
| Brand color hex values                         | `packages/ui/src/styles/globals.css` — design tokens layer               |
| Translation JSON                               | `packages/i18n/src/messages/` — i18n owns the file format                |
