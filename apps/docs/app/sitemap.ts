import type { MetadataRoute } from "next"

const BASE = "https://docs.afframe.com"

const ROUTES = [
  "/",
  "/developers",
  "/developers/quickstart",
  "/developers/authentication",
  "/developers/errors",
  "/developers/rate-limits",
  "/developers/idempotency",
  "/developers/webhooks",
  "/developers/sdks",
  "/developers/cli",
  "/developers/mcp",
  "/reference",
  "/client",
  "/accounting",
  "/app",
  "/help",
  "/changelog",
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return ROUTES.map((path) => ({
    url: `${BASE}${path}`,
    lastModified,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }))
}
