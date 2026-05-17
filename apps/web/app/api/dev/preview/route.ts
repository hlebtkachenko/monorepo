import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { DEV_PREVIEW_COOKIE } from "@/lib/dev-preview"
import { publicOrigin } from "@/lib/request-origin"

/**
 * Dev-only route to toggle the auth-guard bypass cookie.
 *
 *   GET /api/dev/preview?on=1   → set cookie, redirect to /
 *   GET /api/dev/preview?off=1  → clear cookie, redirect to /
 *
 * Returns 404 in production. The bundler inlines `process.env.NODE_ENV`
 * so the prod path is statically dead-coded.
 */
export async function GET(req: Request) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_DEV_PREVIEW !== "1"
  ) {
    return new NextResponse("Not found", { status: 404 })
  }

  const url = new URL(req.url)
  const on = url.searchParams.get("on") === "1"
  const off = url.searchParams.get("off") === "1"
  const target = url.searchParams.get("to") ?? "/"

  const store = await cookies()
  if (off) {
    store.delete(DEV_PREVIEW_COOKIE)
  } else if (on) {
    store.set(DEV_PREVIEW_COOKIE, "1", {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    })
  }
  return NextResponse.redirect(new URL(target, publicOrigin(req)))
}
