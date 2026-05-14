import { withSentryConfig } from "@sentry/nextjs"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@workspace/ui",
    "@workspace/auth",
    "@workspace/db",
    "@workspace/i18n",
    "@workspace/observability",
    "@workspace/testcontainers",
  ],
  output: "standalone",
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
