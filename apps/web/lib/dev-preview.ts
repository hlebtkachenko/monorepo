import "server-only"

import { cookies } from "next/headers"

/**
 * Dev-only auth-guard bypass for design iteration.
 *
 * When the `app-dev-preview` cookie is set to `1` AND we are NOT in
 * production, auth pages should render even without the normal session /
 * step / token cookies. Use to inspect screen designs locally.
 *
 * In production this function ALWAYS returns false. The branch is
 * statically dead-coded by bundlers because `process.env.NODE_ENV` is
 * inlined at build time — there is no runtime path for a customer to
 * trigger preview mode in prod even if they forge the cookie.
 *
 * Toggle the cookie via `GET /api/dev/preview?on=1` (or `?off=1`). That
 * route also 404s in production.
 */
export const DEV_PREVIEW_COOKIE = "app-dev-preview"

export async function isDevPreview(): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false
  const store = await cookies()
  return store.get(DEV_PREVIEW_COOKIE)?.value === "1"
}
