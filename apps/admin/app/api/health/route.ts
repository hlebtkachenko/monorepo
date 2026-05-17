import { NextResponse } from "next/server"

/**
 * Liveness probe for the admin container. The Docker HEALTHCHECK
 * (apps/admin/Dockerfile) hits this path. Ungated by design — it sits
 * outside the `(gated)` route group so it never touches the session/
 * allowlist check.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json({ ok: true })
}
