import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    sha: process.env.BUILD_SHA ?? "unknown",
    time: process.env.BUILD_TIME ?? "unknown",
    version: process.env.BUILD_VERSION ?? "unknown",
    runtime: `node-${process.versions.node}`,
  });
}
