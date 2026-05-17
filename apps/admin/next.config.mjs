/** @type {import('next').NextConfig} */
const nextConfig = {
  // observability + email are transitive deps of @workspace/db / @workspace/auth
  // and export raw .ts — they must be transpiled even though admin does not
  // import them directly.
  transpilePackages: [
    "@workspace/ui",
    "@workspace/auth",
    "@workspace/db",
    "@workspace/shared",
    "@workspace/observability",
    "@workspace/email",
  ],
  output: "standalone",
}

export default nextConfig
