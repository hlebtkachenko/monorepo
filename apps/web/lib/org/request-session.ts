import { cache } from "react"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"

/**
 * Per-request memoized session read for the org-scoped routes.
 *
 * The org layout and the org page both need the session in the same render
 * pass (the page renders inside the layout), so a bare `auth.api.getSession`
 * in each would hit the session store twice — Better Auth's cookie cache is
 * disabled, so each call is a real DB roundtrip. `React.cache` collapses the
 * two co-rendering reads into one per request.
 *
 * Scoped to the `[orgSlug]` segment on purpose: the other ~25 `getSession`
 * call sites across apps/web are independent entrypoints that don't co-fetch
 * within a single render, so a repo-wide shared helper would be a premature
 * abstraction. Mirror this in a sibling segment only if it develops the same
 * layout+page co-fetch.
 */
export const getRequestSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
)
