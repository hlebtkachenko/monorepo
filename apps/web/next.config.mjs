import { withSentryConfig } from "@sentry/nextjs"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

// `next dev` needs 'unsafe-eval' (React Refresh) + a ws: HMR socket; the
// production header stays strict. headers() is evaluated at build time, so
// NODE_ENV is reliable here (development under `next dev`, production in the
// image build).
const isDev = process.env.NODE_ENV === "development"

// img-src includes https://*.amazonaws.com: avatars render from short-lived
// presigned S3 GET URLs (apps/web/app/_lib/avatar-storage.ts). connect-src
// allows Sentry for the (currently DSN-less) client SDK wiring.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.amazonaws.com",
  "font-src 'self'",
  `connect-src 'self' https://*.sentry.io${isDev ? " ws:" : ""}`,
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
