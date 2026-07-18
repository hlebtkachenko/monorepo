import { cache } from "react"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"

/**
 * Per-request memoized session read for the rebuilt org tree.
 *
 * The org layout and its pages both need the session in the same render pass
 * (the page renders inside the layout); Better Auth's cookie cache is disabled,
 * so each bare `getSession` is a real DB roundtrip. `React.cache` collapses the
 * co-rendering reads into one per request.
 *
 * Owned by the new tree (`apps/web/lib/org/`) so it never reaches into the
 * frozen old tree — mirrors the old `[orgSlug]/_lib/request-session.ts`.
 */
export const getRequestSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
)
