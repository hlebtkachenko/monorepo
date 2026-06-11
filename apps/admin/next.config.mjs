import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

// `next dev` needs 'unsafe-eval' (React Refresh) + a ws: HMR socket; the
// production header stays strict. headers() is evaluated at build time, so
// NODE_ENV is reliable here (development under `next dev`, production in the
// image build).
const isDev = process.env.NODE_ENV === "development"

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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // observability + email are transitive deps of @workspace/db / @workspace/auth
  // and export raw .ts — they must be transpiled even though admin does not
  // import them directly. i18n is admin's direct dep for the auth shell.
  transpilePackages: [
    "@workspace/ui",
    "@workspace/auth",
    "@workspace/db",
    "@workspace/i18n",
    "@workspace/shared",
    "@workspace/observability",
    "@workspace/email",
  ],
  output: "standalone",
  poweredByHeader: false,
  // Site-wide security headers (H2) — stricter than web: admin is the most
  // privileged surface and has no proxy.ts, so Referrer-Policy is
  // no-referrer everywhere (auth flows carry token query params). The
  // X-Robots-Tag rides along unconditionally: admin must never be indexed
  // in any environment (headers() runs at build time, where the per-env
  // APP_ENV is not available, so a staging-only header is not reliable).
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
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
