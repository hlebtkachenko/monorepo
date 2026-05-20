import { ImageResponse } from "next/og"

export const runtime = "edge"
// Static for the lifetime of the deploy. The image has no dynamic
// inputs; without this, every share-card preview hit fires a fresh edge
// invocation + JSX render.
export const revalidate = false
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Afframe Developer Hub"

/**
 * Default OG image for `docs.afframe.com`. Per-page OG images can land
 * later via `opengraph-image.tsx` in the relevant route folder; until
 * then this single image fronts every share.
 */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        background:
          "linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #312E81 100%)",
        color: "#F8FAFC",
        fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      }}
    >
      <div style={{ fontSize: 28, letterSpacing: -0.5, opacity: 0.8 }}>
        docs.afframe.com
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
          Afframe Developer Hub
        </div>
        <div style={{ fontSize: 32, opacity: 0.85, maxWidth: 900 }}>
          Self-hosted accounting platform for Czech regulated workflows. REST
          API · SDK · CLI · MCP.
        </div>
      </div>
      <div style={{ fontSize: 24, opacity: 0.6 }}>
        Stripe-shape · Plaid-shape errors · IETF RateLimit
      </div>
    </div>,
    size,
  )
}
