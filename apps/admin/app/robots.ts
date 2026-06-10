import type { MetadataRoute } from "next"

/**
 * Disallow-all: admin.afframe.com is the privileged operator surface —
 * nothing here should ever be crawled or indexed (M3). Paired with the
 * site-wide `X-Robots-Tag: noindex` header in next.config.mjs.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  }
}
