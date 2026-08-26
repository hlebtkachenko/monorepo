import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

// `next dev` needs 'unsafe-eval' (React Refresh) + a ws: HMR socket; the
// production header stays strict. headers() is evaluated at build time, so
// NODE_ENV is reliable here (development under `next dev`, production in the
// image build).
const isDev = process.env.NODE_ENV === "development"

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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // @workspace/ui and @workspace/i18n export raw .ts/.tsx (source-first, no
  // build step); @workspace/shared is a transitive dep of @workspace/ui.
  transpilePackages: ["@workspace/ui", "@workspace/i18n", "@workspace/shared"],
  output: "standalone",
  poweredByHeader: false,
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
    ]
  },
}

export default withNextIntl(nextConfig)
