import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

// `next dev` needs 'unsafe-eval' (React Refresh) + a ws: HMR socket; the
// production header stays strict. headers() is evaluated at build time, so
// NODE_ENV is reliable here (development under `next dev`, production in the
// image build).
const isDev = process.env.NODE_ENV === "development"

/**
 * An alternative build directory, for the automated header check only.
 *
 * `document-file-headers.test.ts` runs a real `next build` + `next start` and
 * curls the result, because that is the ONLY way to see the headers a browser
 * receives (see the note on DOCUMENT_FILE_CSP below). Pointing that build at
 * its own directory keeps it from clobbering the `.next` a developer's dev
 * server is serving from, and keeps its artefacts out of the one the Docker
 * image copies.
 *
 * UNSET IN EVERY REAL BUILD. `apps/beta/Dockerfile` does not set it, so the
 * image build writes `.next` and copies `.next/standalone` as before; if
 * someone ever did set it there, the COPY would fail loudly rather than
 * producing a subtly wrong image.
 */
const distDir = process.env.BETA_DIST_DIR

// Beta has no S3 previews and no Sentry client yet, so every fetch axis stays
// on 'self'. Widen a directive only when the feature that needs it lands.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // `upgrade-insecure-requests` rewrites every subresource fetch to https.
  // Correct in production (always https). In dev it breaks the http localhost
  // server: WebKit honors the upgrade on loopback, so CSS/JS/fonts are fetched
  // over https://localhost (which the dev server can't answer) and the page
  // renders unstyled; Chromium silently exempts loopback, hiding the bug.
  // Production only.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ")

/**
 * The ONE route whose CSP differs, and the policy it gets.
 *
 * `/api/orgs/:orgSlug/documents/:documentId/file` streams a client's own
 * document, and the Dokumenty row sheet renders PDFs by framing that URL
 * (spec §2.2 "sandboxed preview"). The site-wide policy above carries
 * `frame-ancestors 'none'`, which forbids framing by ANY page — our own
 * included — so the preview cannot exist without this override.
 *
 * WHY THE OVERRIDE LIVES HERE AND NOT IN THE ROUTE HANDLER. Measured on a
 * running server, not assumed: a `content-security-policy` set on the Response
 * a route handler returns is silently REPLACED by the `/(.*)` entry above, so
 * the route's own header never reaches the client (an unrelated header set by
 * the same handler did survive — it is specifically the same-key collision that
 * the config wins). A second, more specific `headers()` entry listed AFTER the
 * site-wide one replaces that single key for the matching path and leaves every
 * other site-wide header — nosniff, Referrer-Policy, Permissions-Policy, HSTS,
 * X-Robots-Tag — untouched. That is the mechanism used here, and it is the
 * reason nothing else in the app is weakened: every other path, including the
 * sibling `/api/orgs/:orgSlug/documents` list route, keeps `'none'`.
 *
 * The value is duplicated from `DOCUMENT_FILE_CSP` in that route module — a
 * .mjs config cannot import a TS module — and
 * `app/api/orgs/[orgSlug]/documents/[documentId]/file/document-file-headers.test.ts`
 * boots this app over real HTTP and fails if the two ever drift.
 */
const DOCUMENT_FILE_PATH = "/api/orgs/:orgSlug/documents/:documentId/file"
const DOCUMENT_FILE_CSP = "default-src 'none'; sandbox; frame-ancestors 'self'"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // @workspace/ui and @workspace/i18n export raw .ts/.tsx (source-first, no
  // build step); @workspace/shared is a transitive dep of @workspace/ui.
  transpilePackages: ["@workspace/ui", "@workspace/i18n", "@workspace/shared"],
  output: "standalone",
  // `heic-decode` re-exports `libheif-js/wasm-bundle` — 1.5 MB of emscripten
  // output whose WebAssembly rides inside the JavaScript as base64 and which
  // reaches for `fs`, `path` and `__dirname` at load. Bundling that into the
  // server build is slow at best and broken at worst; leaving it external means
  // Next requires it from node_modules at runtime and traces the package into
  // `.next/standalone` as it stands. Nothing here is client code — the module is
  // `server-only` and reached only from the upload path.
  serverExternalPackages: ["heic-decode"],
  poweredByHeader: false,
  ...(distDir ? { distDir } : {}),
  // Site-wide security headers. Referrer-Policy is `no-referrer` everywhere:
  // beta's login/setup-link flows carry tokens in the URL, and the portal has
  // no cross-origin analytics that needs a referrer. The X-Robots-Tag rides
  // along unconditionally — the client portal must never be indexed in any
  // environment (headers() runs at build time, where the per-env APP_ENV is
  // not available, so a staging-only header would not be reliable).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // HSTS is an https-only directive; browsers ignore it over http, so
          // on the http dev server it is dead weight at best and a pin risk at
          // worst. Production only.
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]),
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // MUST stay last: order is what makes this an override rather than a
      // no-op. See the note on DOCUMENT_FILE_CSP above.
      {
        source: DOCUMENT_FILE_PATH,
        headers: [{ key: "Content-Security-Policy", value: DOCUMENT_FILE_CSP }],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
