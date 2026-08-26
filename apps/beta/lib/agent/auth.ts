import "server-only"

import { z } from "zod"

import { touchAgentKeyUsed } from "@/lib/data/agent-access"
import { resolveAgentScope, type AgentScope } from "@/lib/data/scope"
import {
  BETA_AGENT_IP_RATE_LIMIT,
  BETA_AGENT_KEY_RATE_LIMIT,
} from "@/lib/auth/policy"
import { agentIpRateLimiter, agentKeyRateLimiter } from "@/lib/auth/rate-limit"
import { rateLimitKey } from "@/lib/auth/request-ip"

import {
  agentError,
  agentRateLimited,
  agentUnauthorized,
  AGENT_MAX_BODY_BYTES,
} from "./http"
import { bearerKey, hashAgentKey } from "./key"
import { tenancyKeysIn } from "./schemas"

/**
 * The front door of `/api/agent/v1/*`: who is calling, may they call this often,
 * and is the body something we are willing to parse.
 *
 * WHAT IT DOES NOT DO: decide which BOOK the call may touch. That is
 * `resolveAgentOwnerScope`, run per request against the slug in the URL, and it
 * is the only place tenancy is decided (see `lib/data/scope.ts`). Splitting the
 * two is deliberate — an authenticated key with no reachable organization is a
 * 404, not a 401, and the two questions must not collapse into one check.
 *
 * ORDER OF THE TWO BUDGETS. The IP budget is spent FIRST, before the presented
 * value is hashed and before the database is touched, because it is the only
 * budget that applies to a caller with no valid key: hashing on demand for an
 * unauthenticated stranger is a CPU faucet. The key budget is spent after
 * resolution, because it cannot be keyed on anything until then.
 *
 * NOTHING HERE LOGS THE CREDENTIAL. The raw value is read from the header,
 * hashed, and dropped; it never enters a log line, an error, a response or a
 * row. The only durable trace of a call is its `activity_log` row, which names
 * the key by ID.
 */
export type AgentAuth =
  | { readonly ok: true; readonly agent: AgentScope }
  | { readonly ok: false; readonly response: Response }

export async function authenticateAgent(request: Request): Promise<AgentAuth> {
  const ipVerdict = agentIpRateLimiter(
    rateLimitKey(request.headers, "agent-ip"),
    BETA_AGENT_IP_RATE_LIMIT,
  )
  if (!ipVerdict.allowed) {
    return {
      ok: false,
      response: agentRateLimited(ipVerdict.retryAfterSeconds),
    }
  }

  const presented = bearerKey(request.headers)
  if (presented === null) return { ok: false, response: agentUnauthorized() }

  const agent = await resolveAgentScope(hashAgentKey(presented))
  if (!agent) return { ok: false, response: agentUnauthorized() }

  const keyVerdict = agentKeyRateLimiter(
    `agent-key:${agent.keyId}`,
    BETA_AGENT_KEY_RATE_LIMIT,
  )
  if (!keyVerdict.allowed) {
    return {
      ok: false,
      response: agentRateLimited(keyVerdict.retryAfterSeconds),
    }
  }

  await touchAgentKeyUsed(agent)
  return { ok: true, agent }
}

/**
 * The caller's `Idempotency-Key`, or the refusal for a malformed one.
 *
 * OPTIONAL, AND WORTH SENDING. With one, a retried call is replayed from
 * `activity_log` instead of applied twice (the unique index over
 * (agent_key_id, request_id) is what enforces that, inside the same transaction
 * as the write). Without one, a retry is a second, real act — which for a batch
 * publish means one more superseded batch, and for an upsert means nothing at
 * all, since `externalRef` already makes those idempotent by key.
 *
 * ABSENT AND MALFORMED ARE NOT THE SAME ANSWER, and conflating them is how a
 * safety mechanism turns into a hazard. An earlier draft returned `null` for
 * both: a caller whose id carried a stray space or a UTF-8 dash would have its
 * header quietly ignored, the call would run WITHOUT idempotency protection, and
 * the 200 it got back would look identical to a protected one. The retry it then
 * performed in good faith would publish a second batch. So a header that is
 * present and does not parse is a 400 — the caller asked for a guarantee this
 * server cannot give under that name, and it has to hear so.
 *
 * The character class is deliberately narrow: this value is stored, compared and
 * read by an operator, and a header is the one input nobody can sanitise.
 */
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,200}$/

export type RequestIdResult =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly response: Response }

export function requestId(request: Request): RequestIdResult {
  const raw = request.headers.get("idempotency-key")
  if (raw === null) return { ok: true, value: null }

  const value = raw.trim()
  // A header present but empty is as malformed as one full of spaces: the caller
  // meant to send an id and sent nothing, which is not the same as not asking.
  if (!REQUEST_ID.test(value)) {
    return { ok: false, response: agentError(400, "invalid_idempotency_key") }
  }
  return { ok: true, value }
}

/**
 * Read and validate a JSON body, or answer with the refusal.
 *
 * FOUR GATES, IN THIS ORDER: media type, declared size, actual size, then
 * shape — cheapest and most attacker-controlled first, so a hostile body is
 * rejected before it is buffered and long before zod walks it.
 *
 * The tenancy scan runs on the RAW parsed value, before the schema, on purpose.
 * Every schema here is `.strict()`, so `organizationId` in a body would already
 * be an unknown-key error — but it would be reported as one, and "unrecognized
 * key" is the wrong thing to tell an integration that just tried to name a
 * tenant. `tenancy_key_in_payload` is the answer that says what happened, and
 * having it named is what makes the rule testable as a rule rather than as a
 * side effect of strictness.
 */
export type AgentBody<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly response: Response }

export async function readAgentBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<AgentBody<T>> {
  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: agentError(415, "unsupported_media_type"),
    }
  }

  const declared = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declared) && declared > AGENT_MAX_BODY_BYTES) {
    return { ok: false, response: agentError(413, "payload_too_large") }
  }

  const raw = await request.text()
  // A chunked request declares no length, so the bytes actually read are
  // checked too. `text()` has already buffered them — the cap that matters for
  // memory is the platform's own request limit; this one is the honest refusal
  // for a body we will not parse.
  if (raw.length > AGENT_MAX_BODY_BYTES) {
    return { ok: false, response: agentError(413, "payload_too_large") }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, response: agentError(400, "invalid_json") }
  }

  const tenancy = tenancyKeysIn(parsed)
  if (tenancy.length > 0) {
    return {
      ok: false,
      response: agentError(400, "tenancy_key_in_payload", {
        keys: tenancy.slice(0, 10),
      }),
    }
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    return {
      ok: false,
      response: agentError(400, "invalid_body", {
        // Path and code only. A zod message can quote the offending VALUE, and
        // echoing a client's own accounting figures back through an error is a
        // habit worth not starting. Capped so a 5000-row payload of rubbish
        // cannot make the error larger than the request.
        issues: result.error.issues.slice(0, 20).map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
        })),
      }),
    }
  }

  return { ok: true, value: result.data }
}
