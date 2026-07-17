import { NextResponse } from "next/server"

import { stopImpersonation } from "@/lib/admin-impersonation"
import { publicOrigin } from "@/lib/request-origin"

/**
 * Closes the current staff user's active impersonation window.
 *
 * The impersonation banner (`apps/admin/app/(gated)/_components/impersonation-banner.tsx`)
 * is rendered server-side from the root layout, so its "Stop" button is a
 * plain HTML `<form method="post">`. That form needs a real POST endpoint;
 * server actions imported into a Server Component can't be referenced from
 * a static form action attribute.
 *
 * On success or failure we redirect back to `/` with 303 See Other so the
 * browser issues a fresh GET (which re-evaluates `getActiveImpersonation`
 * and drops the banner once the row is closed). The audit + Better Auth
 * `stopImpersonating` call already happen inside `stopImpersonation`.
 *
 * Intentionally NO `GET` export — this route only handles POSTs from the
 * banner form.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    await stopImpersonation()
  } catch (err) {
    console.error("/api/admin/impersonation/stop: stopImpersonation threw", err)
  }
  return NextResponse.redirect(new URL("/", publicOrigin(request)), 303)
}
