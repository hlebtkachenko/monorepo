import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { INestApplication } from "@nestjs/common"
import { apiReference } from "@scalar/nestjs-api-reference"
import type { Request, Response } from "express"
import type { ApiOpenApiDocument } from "./openapi"

/**
 * Brand SVG inlined at boot so the brand-assets directory in
 * packages/ui stays the single source of truth. Resolves relative to
 * this file rather than process.cwd() so the bundle works both in dev
 * (cwd = apps/api) and in the production image (the brand-assets
 * package is bundled by webpack as referenced source). Read errors
 * fail open: the page renders without a logo rather than failing the
 * route. The width:height proportion in customCss assumes the
 * horizontal logo; the SVGs in source/primary-{light,dark}/ are
 * 1194 × 242 (≈ 4.93:1).
 */
function readBrandSvg(variant: "primary-light" | "primary-dark"): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const path = resolve(
      here,
      "../../../packages/ui/src/brand-assets/source",
      variant,
      "horizontal.svg",
    )
    return readFileSync(path, "utf8")
  } catch {
    return ""
  }
}

const BRAND_LIGHT_SVG_DATA_URI = encodeBrandSvgDataUri("primary-light")
const BRAND_DARK_SVG_DATA_URI = encodeBrandSvgDataUri("primary-dark")

function encodeBrandSvgDataUri(
  variant: "primary-light" | "primary-dark",
): string {
  const svg = readBrandSvg(variant)
  if (!svg) return ""
  // URL-encoded data URI (not base64) — smaller payload and lets the
  // browser cache the SVG path-by-path. Each `#` and `<` must be escaped
  // so the URI survives CSS parsing.
  const encoded = svg
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .trim()
  return `url("data:image/svg+xml;charset=utf-8,${encoded}")`
}

/**
 * Public API docs routes for the `/v1` surface.
 *
 * - `GET /v1/openapi.json` — raw OpenAPI 3.1 spec, canonical machine-readable
 *   document consumed by CI drift checks, Spectral lint, and SDK / MCP /
 *   SDK + MCP codegen.
 * - `GET /` — Scalar API Reference. Mounted at the host root (FINMAP-style:
 *   a direct hit on `api.afframe.com` lands the public surface). Scalar
 *   bootstraps from the jsDelivr CDN; the document is inlined into the page
 *   to skip a second round-trip.
 * - `GET /v1/docs` — 301 redirect to `/`. Preserves AFF-220 bookmarks and
 *   any external generator that still points at the old path.
 *
 * The full Scalar configuration surface is enabled here intentionally — the
 * widget is the single source of truth for "what the API looks like to a
 * developer in a browser". When this page is wrong, the docs site, the SDK,
 * the CLI, and the MCP server all drift away from the spec.
 */

/**
 * Brand-aligned CSS variables. This page renders outside Next.js so the
 * tokens can't be shared from `packages/ui`; the values mirror the brand
 * palette extracted from `packages/ui/src/brand-assets/source/*.svg`:
 *
 *   --primary-green : #009473  (logomark, primary-light)
 *   --accent-green  : #28DCB1  (primary-dark accent)
 *   --ink           : #0A1F1A  (dark text on light)
 *
 * Neutrals mirror our shadcn palette (`packages/ui/src/styles/globals.css`).
 * If the brand palette moves, update brand-assets first and reflect here.
 *
 * Additional CSS rules hide Scalar's workspace topbar (Configure / Share /
 * Deploy buttons) which we don't use — those are Scalar Cloud features
 * (see ADR-0024 Amendment, no Cloud Scalar). Selectors are best-effort
 * against Scalar v1.1.16's DOM; refine if Scalar changes its class names.
 */
const CUSTOM_CSS = `
/*
 * Brand color tokens. Scalar wraps its UI in .scalar-app and applies
 * its own theme inside :where() (specificity 0). Our overrides target
 * .light-mode and .dark-mode at the same scope plus :root as a
 * belt-and-braces fallback for any element that escapes the scoping.
 * Without the duplication the Scalar default theme wins on some
 * cascade paths.
 */
:root,
.light-mode,
.scalar-app.light-mode,
.scalar-app .light-mode {
  --scalar-color-1: #0A1F1A;
  --scalar-color-2: #475569;
  --scalar-color-3: #64748b;
  --scalar-color-accent: #009473;
  --scalar-background-1: #ffffff;
  --scalar-background-2: #f8fafc;
  --scalar-background-3: #f1f5f9;
  --scalar-border-color: #e2e8f0;
}
.dark-mode,
.scalar-app.dark-mode,
.scalar-app .dark-mode {
  --scalar-color-1: #F3F4F6;
  --scalar-color-2: #94a3b8;
  --scalar-color-3: #64748b;
  --scalar-color-accent: #28DCB1;
  --scalar-background-1: #0A1F1A;
  --scalar-background-2: #0f2823;
  --scalar-background-3: #143630;
  --scalar-border-color: #1f3b34;
}
.scalar-app {
  font-family:
    -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
}

/*
 * Hide Scalar workspace topbar elements (Configure / Share / Deploy /
 * Ask AI). The Ask AI button is also disabled in config via
 * \`agent.disabled\`; this CSS is a belt-and-braces for any version
 * where the agent flag doesn't suppress the rendered button.
 */
.scalar-app [data-action="share"],
.scalar-app [data-action="deploy"],
.scalar-app [data-action="configure"],
.scalar-app [data-feature="ask-ai"],
.scalar-app .ask-ai-button,
.scalar-app .scalar-topbar-actions,
.scalar-app .scalar-workspace-actions {
  display: none !important;
}

/*
 * Brand logo (horizontal wordmark) inlined as a data-URI from
 * \`packages/ui/src/brand-assets/source/primary-{light,dark}/horizontal.svg\`
 * — the brand-assets directory stays the single source of truth.
 * Painted onto the sidebar header. If Scalar changes its sidebar DOM
 * in a future bump, the logo hides silently (the background-image just
 * paints nothing). Falls back to the favicon-served URL if the inline
 * read failed at boot.
 */
.afframe-logo {
  position: fixed;
  top: 14px;
  left: 18px;
  width: 132px;
  height: 28px;
  background-repeat: no-repeat;
  background-position: left center;
  background-size: contain;
  z-index: 50;
  pointer-events: none;
}
.afframe-logo.light {
  background-image: ${BRAND_LIGHT_SVG_DATA_URI || 'url("/favicon.svg")'};
}
.afframe-logo.dark {
  background-image: ${BRAND_DARK_SVG_DATA_URI || 'url("/favicon.svg")'};
  display: none;
}
.dark-mode .afframe-logo.light,
html.dark .afframe-logo.light {
  display: none;
}
.dark-mode .afframe-logo.dark,
html.dark .afframe-logo.dark {
  display: block;
}

/*
 * Sidebar bottom-pinned action buttons. Scalar OSS doesn't expose
 * configurable nav links, so we inject two anchors at the bottom-left
 * of the viewport — mirroring the position the "Open API Client"
 * button used to occupy. Styled with the brand green, square corners
 * (border-radius: 0) per the design ask, and high z-index so they sit
 * above Scalar's own footer mark.
 */
.afframe-sidebar-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 260px;
  display: flex;
  flex-direction: column;
  background: var(--scalar-background-2, #f8fafc);
  border-right: 1px solid var(--scalar-border-color, #e2e8f0);
  border-top: 1px solid var(--scalar-border-color, #e2e8f0);
  z-index: 40;
}
.afframe-sidebar-actions a {
  display: block;
  padding: 12px 16px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--scalar-color-1, #0A1F1A);
  text-decoration: none;
  border-radius: 0;
  border-top: 1px solid var(--scalar-border-color, #e2e8f0);
  transition: background-color 120ms ease, color 120ms ease;
}
.afframe-sidebar-actions a:first-child {
  border-top: 0;
}
.afframe-sidebar-actions a:hover {
  background: var(--scalar-color-accent, #009473);
  color: #ffffff;
}
.dark-mode .afframe-sidebar-actions,
html.dark .afframe-sidebar-actions {
  background: var(--scalar-background-2, #0f2823);
  border-color: var(--scalar-border-color, #1f3b34);
}
.dark-mode .afframe-sidebar-actions a,
html.dark .afframe-sidebar-actions a {
  color: var(--scalar-color-1, #F3F4F6);
  border-color: var(--scalar-border-color, #1f3b34);
}
.dark-mode .afframe-sidebar-actions a:hover,
html.dark .afframe-sidebar-actions a:hover {
  background: var(--scalar-color-accent, #28DCB1);
  color: #0A1F1A;
}

/* Reserve space at the sidebar bottom so the action buttons don't
 * cover the last items in the Models list, and at the top so the
 * brand logo has its own slot. Scalar's confirmed sidebar class is
 * \`.t-doc__sidebar\` (verified against
 * @scalar/nestjs-api-reference v1.1.16); the fallback selectors
 * survive a Scalar DOM rename. */
.scalar-app .t-doc__sidebar,
.scalar-app aside[class*="sidebar"],
.scalar-app .sidebar {
  padding-bottom: 90px;
  padding-top: 56px;
}
`

/**
 * Remote MCP integration. Only advertised in the Scalar reference when the
 * URL is configured for the running environment — `apps/mcp` ships as a
 * stdio package today, so prod / staging stay disabled until an HTTP wrapper
 * lands. The env var keeps the config declarative and lets staging point at
 * a preview deployment without a code change.
 */
function mcpConfig() {
  const url = process.env.AFFRAME_MCP_URL?.trim()
  if (!url) return { name: "Afframe MCP", disabled: true }
  return { name: "Afframe MCP", url }
}

export function registerDocsRoutes(
  app: INestApplication,
  document: ApiOpenApiDocument,
): void {
  const adapter = app.getHttpAdapter()

  // Serialize once. Express's `res.send(obj)` re-stringifies the document
  // on every request, and this object is static for the process lifetime.
  const serializedDoc = JSON.stringify(document)
  adapter.get("/v1/openapi.json", (_req: Request, res: Response) => {
    res.type("application/json").send(serializedDoc)
  })

  adapter.get("/v1/docs", (_req: Request, res: Response) => {
    res.redirect(301, "/")
  })

  // HTML fragment injected into Scalar's response just before </body>.
  // Adds the brand logo (top-left) and two sidebar-bottom buttons
  // (Open Developer Docs + Report Bug) at the position the prior
  // "Open API Client" button occupied. Scalar OSS has no native
  // headerLinks / apiClientButton config, so injection is the only
  // route — see AFF-237 and AFF-238 for the upstream tracking issues.
  const injectedHtml = `
    <div class="afframe-logo light"></div>
    <div class="afframe-logo dark"></div>
    <nav class="afframe-sidebar-actions" aria-label="Afframe quick links">
      <a href="https://docs.afframe.com/developer" target="_blank" rel="noreferrer noopener">Open Developer Docs</a>
      <a href="mailto:support+feedback@afframe.com?subject=%5Bbug%5D%20" target="_blank" rel="noreferrer noopener">Report a bug</a>
    </nav>
  `

  // Bind Scalar to GET `/` exactly. Using `app.use("/", apiReference(...))`
  // would catch every request — the Scalar handler responds unconditionally
  // (no `next()` call), so it would intercept `/v1/ping`, `/api/health`,
  // and every other route, silently breaking the entire API surface.
  const scalarHandler = apiReference({
    content: document,
    pageTitle: "Afframe Public API · Reference",
    theme: "default",
    layout: "modern",
    persistAuth: true,
    defaultOpenAllTags: true,
    hideDarkModeToggle: false,
    showOperationId: false,
    // Workspace + AI features off — we run Scalar OSS without Cloud
    // integration (ADR-0024 Amendment 2026-05-21). Agent.disabled
    // hides the Ask AI button (otherwise enabled by default on
    // localhost with 10 free messages). showDeveloperTools "never"
    // hides the top-right Developer Tools button. hideClientButton
    // hides the bottom-left "Open API Client" launcher.
    agent: { disabled: true },
    showDeveloperTools: "never",
    hideClientButton: true,
    authentication: {
      preferredSecurityScheme: "bearer",
    },
    defaultHttpClient: {
      targetKey: "shell",
      clientKey: "curl",
    },
    // Prune verbose generated snippets we don't write docs for. Keeps the
    // request-builder dropdown to languages the SDK / CLI actually back.
    hiddenClients: {
      c: true,
      clojure: true,
      csharp: true,
      dart: true,
      fsharp: true,
      kotlin: true,
      objc: true,
      ocaml: true,
      powershell: true,
      r: true,
      swift: true,
    },
    // Servers are intentionally NOT set here. Scalar inherits them from
    // the OpenAPI document's `servers` array (registered in
    // `packages/shared/src/api/registry.ts`), so the spec is the single
    // source of truth — no chance of the docs page and the spec drifting.
    metaData: {
      title: "Afframe Public API · Reference",
      description:
        "Self-hosted accounting API for Czech regulated workflows. Stripe-shape REST, Plaid-shape errors, IETF RateLimit headers.",
      ogTitle: "Afframe Public API",
      ogDescription: "Public REST API for the Afframe accounting platform.",
      ogImage: "https://api.afframe.com/og.png",
      twitterCard: "summary_large_image",
    },
    mcp: mcpConfig(),
    customCss: CUSTOM_CSS,
  })

  adapter.get("/", (req: Request, res: Response) => {
    // Wrap res.send so we can splice our injectedHtml into Scalar's HTML
    // response before </body>. Scalar's middleware (verified against
    // @scalar/nestjs-api-reference v1.1.16 source: signature is
    // (req, res) => void, no next) calls res.send(html) synchronously
    // — wrapping res.send BEFORE the middleware runs is the safe
    // pattern. If Scalar ever switches to res.write + res.end the wrap
    // below becomes a no-op and the logo + bottom buttons just don't
    // show — degrades gracefully.
    const origSend = res.send.bind(res)
    res.send = (body: unknown): Response => {
      if (typeof body === "string" && body.includes("</body>")) {
        const patched = body.replace("</body>", `${injectedHtml}</body>`)
        return origSend(patched)
      }
      return origSend(body)
    }
    scalarHandler(req, res)
  })
}
