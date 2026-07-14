import { NextResponse } from "next/server"

import { getBuildIdentity } from "@workspace/ui/brand-assets"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
  const deployment = getBuildIdentity()

  return NextResponse.json(
    {
      ...deployment,
      time: process.env.BUILD_TIME ?? "unknown",
      runtime: `node-${process.versions.node}`,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "CDN-Cache-Control": "no-store",
      },
    },
  )
}
