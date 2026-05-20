import type { MetadataRoute } from "next"

import { listContent } from "@/lib/content"

const BASE = "https://docs.afframe.com"

const STATIC_ROUTES = [
  "/",
  "/developers",
  "/reference",
  "/client",
  "/accounting",
  "/app",
  "/help",
  "/changelog",
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  const dynamic = listContent("developers").map((p) => `/developers/${p.slug}`)
  return [...STATIC_ROUTES, ...dynamic].map((path) => ({
    url: `${BASE}${path}`,
    lastModified,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }))
}
