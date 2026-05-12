/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@workspace/ui",
    "@workspace/db",
    "@workspace/observability",
    "@workspace/testcontainers",
  ],
  output: "standalone",
}

export default nextConfig
