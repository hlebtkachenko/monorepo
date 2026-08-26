import type { MetadataRoute } from "next"

/**
 * Disallow-all: beta.afframe.com is an invite-only client portal, not a
 * marketing site — nothing here should ever be crawled or indexed. Paired with
 * the site-wide `X-Robots-Tag: noindex, nofollow` header in next.config.mjs.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  }
}
