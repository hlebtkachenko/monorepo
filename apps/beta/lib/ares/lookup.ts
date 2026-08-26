import "server-only"

import {
  lookupAres,
  RegistryLookupError,
  type AresProfile,
} from "@workspace/registries"

/**
 * The one call to ARES this app makes, and the 24h cache in front of it (spec
 * §2.10).
 *
 * `@workspace/registries` is a zero-dependency fetch + Zod package (its own
 * header says so): it holds no credential, no database handle and no workspace
 * import, so pulling it into beta costs one workspace dependency and nothing
 * else. The integration follows the pattern
 * `apps/web/app/fakturace/_lib/ares-action.ts` established, with ONE deliberate
 * difference, which the Advisor's Part-5 note calls out explicitly: fakturace
 * omits the AbortSignal and beta must not.
 *
 * WHY THE TIMEOUT IS NOT OPTIONAL. `lookupAres` passes the signal straight to
 * `fetch`, and `fetch` without one waits on the platform default — which on a
 * Fargate task talking to a government registry through no NAT is "until the
 * socket gives up". A Server Action that never returns is a page that never
 * responds, and the failure mode this cache exists to avoid (someone clicking
 * "Načíst z ARES" again) is exactly what a hanging request produces. 5 seconds
 * is the Advisor's number; a registry that has not answered in five is down for
 * the purposes of a form the user is sitting in front of.
 *
 * WHY THE CACHE IS IN-PROCESS AND THE STAMP IS IN THE DATABASE.
 *
 * Spec §4 gives `organization` exactly one ARES column — `ares_fetched_at` —
 * and no payload column, for either `organization` or `partner`. So the stamp
 * is the durable half (it is what the card renders as "Naposledy načteno z
 * ARES: …" and what the office reads to know whether the identity was ever
 * reconciled), and the profile itself is a cache: derived data, reconstructible
 * by asking again, never a source of truth. Keeping it in the process — the
 * same reasoning `lib/auth/rate-limit.ts` and Better Auth's own limiter use in
 * this app — means one Fargate task (`desiredCount: 1`, plan Part 1) holds the
 * whole thing, and a restart costs one extra registry call rather than a
 * migration.
 *
 * The consequence is stated plainly rather than hidden: after a deploy, the
 * first "Načíst z ARES" for a book calls ARES even if the stamp is an hour old.
 * That is a cache miss, not a correctness problem — the answer is re-fetched
 * from the authoritative source, and the alternative (a jsonb column of
 * registry PII, retained indefinitely, that no surface reads) is a worse trade
 * on a GDPR-scoped system for a saving measured in single HTTP requests.
 */

/**
 * The Advisor's number (Part 5). A registry that has not answered in five
 * seconds is down for the purposes of a form somebody is sitting in front of.
 *
 * Exported so the test can assert the DEFAULT is still five seconds while
 * exercising the abort path at a duration a suite can afford —
 * `AbortSignal.timeout` is a platform timer that vitest's fake clock does not
 * drive, so "the signal fires" is only observable in real time.
 */
export const ARES_TIMEOUT_MS = 5_000
const ARES_CACHE_TTL_MS = 24 * 60 * 60 * 1000
/**
 * Beta serves one accounting office; the number of distinct IČO it will ever
 * look up in a day is in the dozens. The bound exists so a loop cannot grow the
 * map without limit, not because the working set is expected to approach it.
 */
const ARES_CACHE_MAX_ENTRIES = 500

type CacheEntry = { profile: AresProfile; fetchedAtMs: number }

const cache = new Map<string, CacheEntry>()

/** Exported for tests only — a suite must be able to start from a cold cache. */
export function resetAresCache(): void {
  cache.clear()
}

export type AresLookupResult =
  | { ok: true; profile: AresProfile; cached: boolean }
  | { ok: false; reason: "not_found" | "unavailable" }

/**
 * Look up `ico` (already normalized to 8 digits by `normalizeIco`), preferring a
 * cached answer less than 24h old.
 *
 * NEVER THROWS. Every failure — a 404 for an unknown IČO, a timeout, a payload
 * ARES changed the shape of — comes back as `ok: false`, because the caller is a
 * form that must stay editable (spec §2.10: "error keeps form editable"). A
 * thrown error there would replace a filled-in identity card with an error
 * boundary and lose the user's typing.
 */
export async function lookupOrganizationAres(
  ico: string,
  options: {
    now?: number
    fetchImpl?: typeof fetch
    /** Test-only override; production always uses `ARES_TIMEOUT_MS`. */
    timeoutMs?: number
  } = {},
): Promise<AresLookupResult> {
  const now = options.now ?? Date.now()

  const hit = cache.get(ico)
  if (hit && now - hit.fetchedAtMs < ARES_CACHE_TTL_MS) {
    return { ok: true, profile: hit.profile, cached: true }
  }

  // `AbortSignal.timeout` rather than a hand-rolled controller + setTimeout: it
  // needs no clearTimeout on the success path, so it cannot leak a timer that
  // holds the process open.
  const signal = AbortSignal.timeout(options.timeoutMs ?? ARES_TIMEOUT_MS)

  let profile: AresProfile
  try {
    profile = await lookupAres(ico, {
      signal,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    })
  } catch (error) {
    // `RegistryLookupError` is the package's own "the registry did not give me
    // a subject" — a 404 on an IČO nobody holds looks the same as a 500, and
    // for a form the distinction that matters is "check the number" vs "try
    // later". The package exposes only the message, so this maps the one case
    // it spells out (`ARES returned 404`) and treats the rest as transient.
    if (error instanceof RegistryLookupError) {
      return {
        ok: false,
        reason: error.message.includes("404") ? "not_found" : "unavailable",
      }
    }
    // A timeout normally arrives through the branch above — `lookupAres` wraps
    // the aborted fetch as `RegistryLookupError("ARES request failed")` — so
    // this is the floor under anything else the package or the runtime can
    // throw. Same answer either way: the form stays editable.
    return { ok: false, reason: "unavailable" }
  }

  if (cache.size >= ARES_CACHE_MAX_ENTRIES) {
    for (const [key, entry] of cache) {
      if (now - entry.fetchedAtMs >= ARES_CACHE_TTL_MS) cache.delete(key)
    }
    // Still full of live entries: drop the oldest insertion. Map iteration is
    // insertion-ordered, so the first key is the least recently written.
    if (cache.size >= ARES_CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next()
      if (!oldest.done) cache.delete(oldest.value)
    }
  }
  cache.set(ico, { profile, fetchedAtMs: now })

  return { ok: true, profile, cached: false }
}
