import { withSentryConfig } from "@sentry/nextjs"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

// `next dev` needs 'unsafe-eval' (React Refresh) + a ws: HMR socket; the
// production header stays strict. headers() is evaluated at build time, so
// NODE_ENV is reliable here (development under `next dev`, production in the
// image build).
const isDev = process.env.NODE_ENV === "development"

// Avatars + document previews render from short-lived presigned S3 GET URLs
// (apps/web/app/_lib/avatar-storage.ts, document store). BOTH CSP fetch axes
// must allow the S3 origin: img-src for <img> image previews, connect-src for
// react-pdf/pdf.js XHR that fetches PDF bytes. Keep the origin in ONE const so
// the two directives never drift — a connect-src that lagged img-src silently
// blocked prod PDF preview. In dev the presigned URLs point at the minio
// endpoint (S3_ENDPOINT, e.g. http://localhost:9000) instead of *.amazonaws.com.
// connect-src additionally allows Sentry for the (currently DSN-less) client SDK.
const devS3Origin =
  isDev && process.env.S3_ENDPOINT
    ? ` ${new URL(process.env.S3_ENDPOINT).origin}`
    : ""
const s3Origins = `https://*.amazonaws.com${devS3Origin}`

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${s3Origins}`,
  "font-src 'self'",
  `connect-src 'self' ${s3Origins} https://*.sentry.io${isDev ? " ws:" : ""}`,
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@workspace/ui",
    "@workspace/auth",
    "@workspace/db",
    "@workspace/i18n",
    "@workspace/observability",
    "@workspace/shared",
    "@workspace/email",
    "@workspace/filing",
  ],
  output: "standalone",
  poweredByHeader: false,
  // Site-wide security headers (H1). proxy.ts still sets the stricter
  // `Referrer-Policy: no-referrer` on /auth/* + /onboarding/* — the
  // middleware-set header wins over this config value for those paths.
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
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      // OAuth 2.1 authorization-server discovery (RFC 8414) must be reachable at
      // the root `/.well-known/oauth-authorization-server` URL. The oauthProvider
      // plugin already serves this metadata under Better Auth's base path, so
      // expose it at the canonical root URL by rewriting to that endpoint (no
      // dotfolder route needed, which TypeScript's include globs cannot see).
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/auth/.well-known/oauth-authorization-server",
      },
    ]
  },
}

// withSentryConfig stays the outermost wrapper so that source-map uploads see
// the final compiled config. The webpack plugins skip when SENTRY_DSN is empty
// (local dev, CI without secret) so a missing DSN is a silent build, not a
// failure. tracesSampleRate / replay tuning live in client-side / server-side
// sentry config files added when the trip-wire fires; today this commit only
// wires the build-time integration so future runtime config does not require a
// next.config edit.
export default withNextIntl(
  withSentryConfig(nextConfig, {
    silent: true,
    disableServerWebpackPlugin: !process.env.SENTRY_DSN,
    disableClientWebpackPlugin: !process.env.SENTRY_DSN,
  }),
)
