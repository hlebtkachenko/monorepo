import type { INestApplication } from "@nestjs/common"
import { apiReference } from "@scalar/nestjs-api-reference"
import {
  BRAND_DOCS_URL,
  BRAND_MARKETING_URL,
  BRAND_STATUS_URL,
  BRAND_SUPPORT_EMAIL,
} from "@workspace/ui/brand-assets/constants"
import {
  BRAND_MONO_DARK,
  BRAND_MONO_LIGHT,
  BRAND_RADIUS,
} from "@workspace/ui/brand-assets/tokens"
import type { Request, Response } from "express"
import type { ApiOpenApiDocument } from "./openapi"

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
 * Brand SVGs are served from `apps/api/public/brand-horizontal-{light,dark}.svg`
 * (copied at PR time from `packages/ui/src/brand-assets/source/primary-{light,dark}/horizontal.svg`).
 * Using `useStaticAssets("public")` (see main.ts) makes the previous
 * fs.readFileSync-at-module-load path unnecessary and bundle-safe in
 * the production Docker image (the prior approach silently fell back to
 * `/favicon.svg` = logomark-only when the relative read failed in prod).
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
 * Top navbar — rendered ABOVE Scalar's UI via HTML injection at the
 * start of the document body. (Comment text deliberately avoids the
 * literal lt-body-gt HTML tag string because the response-wrap regex
 * in registerDocsRoutes matches the FIRST occurrence in the response
 * — a comment that mentioned the tag was the bug that prevented the
 * navbar from rendering once.) Mirrors the Next.js "host layout owns
 * the nav" pattern documented at
 * https://scalar.com/products/api-references/integrations/nextjs:
 * Scalar's React component renders inside a parent layout that owns
 * the navbar. We can't import the React component into a NestJS host,
 * so we inject the topbar as plain HTML around Scalar's static
 * response — same shape, different mechanism.
 *
 * Layout: 64px tall, sticky to viewport top, brand mark left, links
 * right. Body padding-top pushes Scalar's content below so the navbar
 * never overlaps the reference.
 */
body {
  padding-top: 64px;
}
.afframe-topnav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  z-index: 1000;
  font-family:
    -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
}
.dark-mode .afframe-topnav,
html.dark .afframe-topnav {
  background: #0A1F1A;
  border-bottom-color: #1f3b34;
}
/*
 * Brand tokens imported from @workspace/ui/brand-assets. Single source of
 * truth is packages/ui/src/styles/globals.css (--brand-mono-light/dark,
 * --radius); tokens.ts mirrors those values for non-CSS consumers like
 * this server-rendered docs page. tokens.test.ts asserts the two stay
 * in sync — change one without the other and CI fails.
 */
:root,
.light-mode,
.scalar-app.light-mode,
.scalar-app .light-mode,
.dark-mode,
.scalar-app.dark-mode,
.scalar-app .dark-mode {
  --afframe-ink: ${BRAND_MONO_DARK};
  --afframe-paper: ${BRAND_MONO_LIGHT};
  --afframe-radius: ${BRAND_RADIUS};
}

.afframe-topnav-brand {
  display: flex;
  align-items: center;
}
.afframe-topnav-brand a {
  display: flex;
  align-items: center;
  height: 40px;
  line-height: 0;
}
.afframe-topnav-brand img {
  display: block;
  height: 36px;
  width: auto;
}
.afframe-topnav-brand .light {
  display: flex;
}
.afframe-topnav-brand .dark {
  display: none;
}
.dark-mode .afframe-topnav-brand .light,
html.dark .afframe-topnav-brand .light {
  display: none;
}
.dark-mode .afframe-topnav-brand .dark,
html.dark .afframe-topnav-brand .dark {
  display: flex;
}
.afframe-topnav-links {
  display: flex;
  align-items: center;
  gap: 4px;
}
.afframe-topnav-links a {
  display: inline-block;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 500;
  color: var(--afframe-ink);
  text-decoration: none;
  border-radius: var(--afframe-radius);
  transition: background-color 120ms ease, color 120ms ease;
}
.afframe-topnav-links a:hover {
  background: var(--afframe-ink);
  color: var(--afframe-paper);
}
.dark-mode .afframe-topnav-links a,
html.dark .afframe-topnav-links a {
  color: var(--afframe-paper);
}
.dark-mode .afframe-topnav-links a:hover,
html.dark .afframe-topnav-links a:hover {
  background: var(--afframe-paper);
  color: var(--afframe-ink);
}

/* Push Scalar's own sidebar / topbar down below our navbar. Without
 * this, Scalar paints its sticky header behind/under the topnav.
 * Scalar's confirmed sidebar class is \`.t-doc__sidebar\` (verified
 * against @scalar/nestjs-api-reference v1.1.16). */
.scalar-app .t-doc__sidebar,
.scalar-app aside[class*="sidebar"],
.scalar-app .sidebar {
  top: 64px !important;
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

  // Top navbar injected at the start of <body>, ABOVE Scalar's UI.
  // Mirrors the Next.js "host layout owns the nav" pattern documented
  // at https://scalar.com/products/api-references/integrations/nextjs
  // — Scalar's React component renders inside a parent layout that
  // owns the navbar. We can't host the React component in NestJS, so
  // the topnav rides as plain HTML around Scalar's response. Brand
  // mark left, custom links right. See customCss above for the
  // styling + body padding-top offset.
  const injectedHtml = `
    <header class="afframe-topnav" role="navigation" aria-label="Afframe">
      <div class="afframe-topnav-brand">
        <a class="light" href="${BRAND_MARKETING_URL}" target="_blank" rel="noreferrer noopener" aria-label="Afframe"><img src="/brand-horizontal-light.svg" alt="Afframe" /></a>
        <a class="dark" href="${BRAND_MARKETING_URL}" target="_blank" rel="noreferrer noopener" aria-label="Afframe"><img src="/brand-horizontal-dark.svg" alt="Afframe" /></a>
      </div>
      <nav class="afframe-topnav-links" aria-label="Afframe quick links">
        <a href="${BRAND_MARKETING_URL}" target="_blank" rel="noreferrer noopener">afframe.com</a>
        <a href="${BRAND_STATUS_URL}" target="_blank" rel="noreferrer noopener">Status</a>
        <a href="${BRAND_DOCS_URL}/developer" target="_blank" rel="noreferrer noopener">Developer Docs</a>
        <a href="mailto:${BRAND_SUPPORT_EMAIL}?subject=%5Bbug%5D%20" target="_blank" rel="noreferrer noopener">Report a bug</a>
      </nav>
    </header>
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
    // response immediately after the body open tag. Inserts at start of
    // body so the navbar lands ABOVE Scalar's mount point in the DOM —
    // Scalar's UI is then offset downward via the body padding-top rule
    // in customCss.
    //
    // The regex matches `</head>` + whitespace + `<body...>` as a single
    // unit. Anchoring on `</head>` is critical — a bare `<body>` regex
    // would also match literal text inside a CSS or HTML comment (we
    // hit this bug: the customCss block mentioned the body tag in
    // prose and got the injection spliced into the style block).
    //
    // Scalar's middleware (verified against
    // @scalar/nestjs-api-reference v1.1.16 source: signature is
    // (req, res) => void, no next) calls res.send(html) synchronously
    // — wrapping res.send BEFORE the middleware runs is the safe
    // pattern. If Scalar ever switches to res.write + res.end the
    // wrap becomes a no-op and the topnav just doesn't show —
    // degrades gracefully without breaking the page.
    const origSend = res.send.bind(res)
    res.send = (body: unknown): Response => {
      if (typeof body === "string") {
        const match = body.match(/<\/head>\s*<body[^>]*>/i)
        if (match) {
          const patched = body.replace(match[0], `${match[0]}${injectedHtml}`)
          return origSend(patched)
        }
      }
      return origSend(body)
    }
    scalarHandler(req, res)
  })
}
