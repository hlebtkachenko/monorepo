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

export default withNextIntl(nextConfig)
