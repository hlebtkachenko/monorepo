import "server-only"

import { headers } from "next/headers"

import { BETA_PEEK_RATE_LIMIT } from "@/lib/auth/policy"
import { peekRateLimiter } from "@/lib/auth/rate-limit"
import { rateLimitKey } from "@/lib/auth/request-ip"
import { peekSetupToken, type SetupTokenView } from "@/lib/auth/setup-token"

/**
 * The rate-limited read behind both one-time-link screens (Advisor carry-in,
 * PR 06 gate).
 *
 * `peekSetupToken` runs on a GET. A GET is neither a Server Action nor a Better
 * Auth endpoint, so neither `consumeRateLimiter` nor Better Auth's own limiter
 * ever sees it — which left the token-shaped URL space as the one unmetered
 * surface in the app. It is also the most informative one: a hit renders the
 * invited address and the organization's legal name, a miss renders the
 * invalid-link card, and the two are trivially distinguishable.
 *
 * THE BUDGET IS SPENT BEFORE THE DATABASE IS TOUCHED. A refused peek costs a map
 * lookup, not a query, so grinding cannot turn the limiter itself into the load.
 *
 * A rate-limited visitor is told so, rather than being shown the invalid-link
 * card. That is not an oracle: the message is about the requester, not about
 * the token, and it is the same message whether the token was real or not.
 */
export type PeekResult =
  | { status: "ok"; view: SetupTokenView }
  | { status: "invalid" }
  | { status: "rate_limited" }

export async function peekSetupLink(rawToken: string): Promise<PeekResult> {
  const requestHeaders = await headers()

  const verdict = peekRateLimiter(
    rateLimitKey(requestHeaders, "setup-peek"),
    BETA_PEEK_RATE_LIMIT,
  )
  if (!verdict.allowed) return { status: "rate_limited" }

  const view = await peekSetupToken(rawToken)
  return view ? { status: "ok", view } : { status: "invalid" }
}
