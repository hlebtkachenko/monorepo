import { NextResponse } from "next/server"

/**
 * Liveness probe for the beta container. Three consumers hit this path: the
 * Docker HEALTHCHECK (apps/beta/Dockerfile), the ECS target-health check, and
 * the deploy workflow's post-deploy smoke step — which is what catches a
 * crash-looping task. Unauthenticated by design and must stay that way: it
 * reports process liveness only, never dependency state.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json({ ok: true })
}
