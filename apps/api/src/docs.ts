import type { INestApplication } from "@nestjs/common"
import { apiReference } from "@scalar/nestjs-api-reference"
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
.light-mode {
  --scalar-color-1: #0A1F1A;
  --scalar-color-2: #475569;
  --scalar-color-3: #64748b;
  --scalar-color-accent: #009473;
  --scalar-background-1: #ffffff;
  --scalar-background-2: #f8fafc;
  --scalar-background-3: #f1f5f9;
  --scalar-border-color: #e2e8f0;
}
.dark-mode {
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

  // Bind Scalar to GET `/` exactly. Using `app.use("/", apiReference(...))`
  // would catch every request — the Scalar handler responds unconditionally
  // (no `next()` call), so it would intercept `/v1/ping`, `/api/health`,
  // and every other route, silently breaking the entire API surface.
  adapter.get(
    "/",
    apiReference({
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
    }),
  )
}
