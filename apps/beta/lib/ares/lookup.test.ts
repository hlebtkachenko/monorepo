/**
 * The lookup's own three properties: the 24h cache, the 5s abort, and the
 * "never throws, the form stays editable" contract (spec §2.10).
 *
 * `fetchImpl` is injected, so nothing here reaches the real registry.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ARES_TIMEOUT_MS,
  lookupOrganizationAres,
  resetAresCache,
} from "./lookup"

const ARES_PAYLOAD = {
  ico: 25012345,
  obchodniJmeno: "Stavby Novák s.r.o.",
  pravniForma: "112",
  dic: "CZ25012345",
  datumVzniku: "2010-03-01",
  financniUrad: "451",
  sidlo: {
    kodStatu: "CZ",
    nazevObce: "Praha",
    psc: 17000,
    textovaAdresa: "Jankovcova 1522/53, 17000 Praha",
    cisloDomovni: 1522,
    cisloOrientacni: 53,
    nazevUlice: "Jankovcova",
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  resetAresCache()
})

describe("lookupOrganizationAres — the 24h cache", () => {
  it("calls the registry on a miss and reports the answer as fresh", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(ARES_PAYLOAD))

    const result = await lookupOrganizationAres("25012345", { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ ok: true, cached: false })
    if (result.ok) expect(result.profile.legalName).toBe("Stavby Novák s.r.o.")
  })

  it("serves a second lookup within 24h from the cache", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(ARES_PAYLOAD))
    const t0 = 1_700_000_000_000

    await lookupOrganizationAres("25012345", { fetchImpl, now: t0 })
    const second = await lookupOrganizationAres("25012345", {
      fetchImpl,
      now: t0 + 23 * 60 * 60 * 1000,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({ ok: true, cached: true })
  })

  it("calls the registry again once the entry is older than 24h", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(ARES_PAYLOAD))
    const t0 = 1_700_000_000_000

    await lookupOrganizationAres("25012345", { fetchImpl, now: t0 })
    const later = await lookupOrganizationAres("25012345", {
      fetchImpl,
      now: t0 + 24 * 60 * 60 * 1000 + 1,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(later).toMatchObject({ ok: true, cached: false })
  })

  it("keys the cache per IČO", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(ARES_PAYLOAD))

    await lookupOrganizationAres("25012345", { fetchImpl })
    await lookupOrganizationAres("00000045", { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("does not cache a failure", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "nope" }, 503))
      .mockResolvedValueOnce(jsonResponse(ARES_PAYLOAD))

    const first = await lookupOrganizationAres("25012345", { fetchImpl })
    const second = await lookupOrganizationAres("25012345", { fetchImpl })

    expect(first).toEqual({ ok: false, reason: "unavailable" })
    expect(second).toMatchObject({ ok: true, cached: false })
  })
})

describe("lookupOrganizationAres — failure is never a throw", () => {
  it("maps a 404 to not_found so the form can say 'check the number'", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404))
    await expect(
      lookupOrganizationAres("25012345", { fetchImpl }),
    ).resolves.toEqual({ ok: false, reason: "not_found" })
  })

  it("maps a server error to unavailable", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 500))
    await expect(
      lookupOrganizationAres("25012345", { fetchImpl }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" })
  })

  it("maps an unrecognised payload to unavailable rather than throwing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ nothing: true }))
    await expect(
      lookupOrganizationAres("25012345", { fetchImpl }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" })
  })

  it("aborts rather than hanging, and reports it as unavailable", async () => {
    // The signal is the thing under test: this fetch never settles on its own,
    // so the ONLY way the call returns is the AbortSignal firing. Run at 20ms
    // rather than the production 5s because `AbortSignal.timeout` is a platform
    // timer that vitest's fake clock does not drive — the assertion below pins
    // the real value. (fakturace omits the signal entirely; the Advisor's
    // Part-5 note requires beta to have it.)
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason ?? new Error("aborted"))
          })
        }),
    ) as unknown as typeof fetch

    await expect(
      lookupOrganizationAres("25012345", { fetchImpl, timeoutMs: 20 }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" })
  })

  it("times out at 5 seconds in production", () => {
    expect(ARES_TIMEOUT_MS).toBe(5_000)
  })

  it("passes an AbortSignal on every call", async () => {
    const seen: (AbortSignal | null | undefined)[] = []
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init?.signal)
        return jsonResponse(ARES_PAYLOAD)
      },
    ) as unknown as typeof fetch

    await lookupOrganizationAres("25012345", { fetchImpl })

    expect(seen).toHaveLength(1)
    expect(seen[0]).toBeInstanceOf(AbortSignal)
  })
})
