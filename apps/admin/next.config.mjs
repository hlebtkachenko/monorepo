import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

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
}

export default withNextIntl(nextConfig)
