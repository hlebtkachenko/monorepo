import type { MetadataRoute } from "next"

/**
 * Disallow-all: app.afframe.com is an authenticated product surface, not a
 * marketing site — nothing here should be crawled or indexed (M3).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  }
}
