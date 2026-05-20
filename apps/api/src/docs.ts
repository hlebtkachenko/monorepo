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
 * shadcn-aligned CSS variables. This page renders outside Next.js, so the
 * tokens can't be shared from `packages/ui`; the values mirror our `:root`
 * + `.dark` palette in `app/globals.css`. Update both files together if the
 * brand palette moves.
 */
const CUSTOM_CSS = `
.light-mode {
  --scalar-color-1: hsl(222.2 47.4% 11.2%);
  --scalar-color-2: hsl(215.4 16.3% 46.9%);
  --scalar-color-3: hsl(215.4 16.3% 56.9%);
  --scalar-color-accent: hsl(221.2 83.2% 53.3%);
  --scalar-background-1: hsl(0 0% 100%);
  --scalar-background-2: hsl(210 40% 98%);
  --scalar-background-3: hsl(210 40% 94%);
  --scalar-border-color: hsl(214.3 31.8% 91.4%);
}
.dark-mode {
  --scalar-color-1: hsl(210 40% 98%);
  --scalar-color-2: hsl(215 20.2% 65.1%);
  --scalar-color-3: hsl(215 20.2% 55.1%);
  --scalar-color-accent: hsl(217.2 91.2% 59.8%);
  --scalar-background-1: hsl(222.2 84% 4.9%);
  --scalar-background-2: hsl(217.2 32.6% 12%);
  --scalar-background-3: hsl(217.2 32.6% 17.5%);
  --scalar-border-color: hsl(217.2 32.6% 17.5%);
}
.scalar-app {
  font-family:
    -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
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
