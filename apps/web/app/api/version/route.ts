import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
  // F4 negative test — DO NOT MERGE. /api/version returns 503 so ECS
  // container healthcheck fails + smoke job's probe fails. Triggers
  // either Circuit Breaker rollback (from ECS) or smoke job rollback
  // (from workflow), both of which exercise the auto-rollback path
  // we added in PR #214.
  return new NextResponse("F4 negative test — version intentionally broken", {
    status: 503,
  })
}
