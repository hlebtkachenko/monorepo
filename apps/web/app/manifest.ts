import type { MetadataRoute } from "next"

import { getBrandText } from "@workspace/ui/brand-assets/server"
import { BRAND_MONO_DARK } from "@workspace/ui/brand-assets/tokens"

/**
 * PWA manifest — served at /manifest.webmanifest. Brand name and the
 * theme/background color come from the brand surface (single source of
 * truth) instead of hardcoded literals.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { name } = await getBrandText()
  return {
    name,
    short_name: name,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    theme_color: BRAND_MONO_DARK,
    background_color: BRAND_MONO_DARK,
    display: "standalone",
  }
}
