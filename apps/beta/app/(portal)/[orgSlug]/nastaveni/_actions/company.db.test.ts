/**
 * Nastavení › Společnost's three Server Actions, driven as the POSTs they are.
 *
 * A SERVER ACTION IS A PUBLIC ENDPOINT: it has a generated name, it is reachable
 * without ever rendering the page that holds its form, and it does not run the
 * page's `isOwner` branch. So this file proves the two things the page cannot:
 * that every role except owner is refused, and that an owner of organization A
 * POSTing organization B's slug gets B's answer (404) rather than A's authority.
 *
 * It also pins the ARES rules at the WRITE boundary, which is where they
 * actually matter: suggest-never-write, per-field accept, `dic: null` never
 * touching `vat_regime`, the 24h stamp, and the error paths that must leave the
 * form editable.
 *
 * `@/lib/ares/lookup` is mocked so nothing here reaches the real registry; the
 * lookup's own behaviour (cache, abort, failure mapping) is covered in
 * `lib/ares/lookup.test.ts`.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { AresProfile } from "@workspace/registries"

import {
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))
const registry = vi.hoisted(() => ({
  result: null as
    | { ok: true; profile: unknown; cached: boolean }
    | { ok: false; reason: "not_found" | "unavailable" }
    | null,
  calls: [] as string[],
}))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}))

vi.mock("@/lib/ares/lookup", () => ({
  lookupOrganizationAres: (ico: string) => {
    registry.calls.push(ico)
    return Promise.resolve(registry.result)
  },
}))

const actions = await import("./company")
const { organizationIdentity } =
  await import("@/lib/data/organization-identity")
const { requireScope } = await import("@/lib/data/scope")

const IDLE = { status: "idle" } as const
const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
}

function fd(entries: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) for (const v of value) data.append(key, v)
    else data.set(key, value)
  }
  return data
}

async function expect404(
  run: () => Promise<unknown>,
  because: string,
): Promise<void> {
  let digest: unknown = "<no throw>"
  try {
    await run()
  } catch (error) {
    digest = (error as { digest?: unknown }).digest ?? error
  }
  expect(digest, because).toBe(NOT_FOUND_DIGEST)
}

function profile(overrides: Partial<AresProfile> = {}): AresProfile {
  return {
    ico: "25012345",
    legalName: "Stavby Novák s.r.o.",
    legalFormCsuCode: "112",
    legalFormCode: "sro",
    personKind: "legal_entity",
    dic: "CZ25012345",
    inPublicRegister: true,
    registeredAt: "2010-03-01",
    naceCodes: [],
    address: {
      street: "Jankovcova 1522/53",
      houseNumber: "1522",
      orientationNumber: "53",
      city: "Praha",
      postalCode: "17000",
      region: null,
      countryCode: "CZ",
    },
    taxOfficeCode: "451",
    registryFileNumber: "C 12345, Městský soud v Praze",
    deliveryAddressLines: [],
    ...overrides,
  }
}

/** Read the card back as the owner — the assertion target for every write. */
async function readCard(org: TestOrganization) {
  as(org.members.owner.headers)
  const identity = await organizationIdentity(await requireScope(org.slug))
  if (!identity) throw new Error("fixture: identity vanished")
  return identity
}

let org: TestOrganization
let other: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
  other = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

beforeEach(() => {
  registry.result = { ok: true, profile: profile(), cached: false }
  registry.calls = []
})

const MINIMAL_SAVE = { legalName: "Testovací s.r.o." }

describe("authz — spec §2.10 'owner edit; others view'", () => {
  it("refuses every non-owner role on every action", async () => {
    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const payload = fd({
        orgSlug: org.slug,
        ico: "25012345",
        ...MINIMAL_SAVE,
      })

      await expect404(
        () => actions.updateCompanyAction(IDLE, payload),
        `${role} must not save the identity card`,
      )
      await expect404(
        () => actions.lookupAresAction(IDLE, payload),
        `${role} must not query ARES for this book`,
      )
      await expect404(
        () =>
          actions.acceptAresAction(
            IDLE,
            fd({ orgSlug: org.slug, ico: "25012345", accept: ["legalName"] }),
          ),
        `${role} must not accept an ARES suggestion`,
      )
    }
  })

  it("refuses a signed-out caller", async () => {
    as(new Headers())
    await expect404(
      () =>
        actions.updateCompanyAction(
          IDLE,
          fd({ orgSlug: org.slug, ...MINIMAL_SAVE }),
        ),
      "no session must not save",
    )
  })

  it("refuses an owner of ANOTHER organization", async () => {
    // The slug is request input; the scope it resolves is not. An owner of A
    // POSTing B's slug gets B's answer.
    as(other.members.owner.headers)
    await expect404(
      () =>
        actions.updateCompanyAction(
          IDLE,
          fd({ orgSlug: org.slug, legalName: "Ukradeno s.r.o." }),
        ),
      "cross-org save must 404",
    )

    const card = await readCard(org)
    expect(card.legalName).not.toBe("Ukradeno s.r.o.")
  })

  it("lets the owner save", async () => {
    as(org.members.owner.headers)
    const result = await actions.updateCompanyAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        legalName: "Stavby Novák s.r.o.",
        ico: "1234567",
        registeredCity: "Praha",
        contactEmail: "info@novak.example",
      }),
    )
    expect(result).toEqual({ status: "ok", message: "nastaveni.okSaved" })

    const card = await readCard(org)
    expect(card.legalName).toBe("Stavby Novák s.r.o.")
    // Spec §2.10 left-pad, applied on the manual path too.
    expect(card.ico).toBe("01234567")
    expect(card.registeredCity).toBe("Praha")
    expect(card.contactEmail).toBe("info@novak.example")
  })
})

describe("updateCompanyAction — what the form may and may not reach", () => {
  it("refuses an IČO that cannot be one, writing nothing", async () => {
    as(org.members.owner.headers)
    const before = await readCard(org)

    as(org.members.owner.headers)
    const result = await actions.updateCompanyAction(
      IDLE,
      fd({ orgSlug: org.slug, legalName: "Jiné jméno", ico: "123456789" }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorIcoInvalid",
    })

    const after = await readCard(org)
    expect(after.legalName).toBe(before.legalName)
    expect(after.ico).toBe(before.ico)
  })

  it("refuses an empty legal name rather than clearing it", async () => {
    as(org.members.owner.headers)
    const result = await actions.updateCompanyAction(
      IDLE,
      fd({ orgSlug: org.slug, legalName: "   " }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorNameRequired",
    })
    expect((await readCard(org)).legalName).not.toBe("")
  })

  it("cannot touch the VAT regime, whatever the POST carries", async () => {
    // Spec §3.5 gives it to /admin. The form has no input for it and the writable
    // set does not name it, so a hand-built POST has nothing to hook onto.
    const before = await readCard(org)

    as(org.members.owner.headers)
    await actions.updateCompanyAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        legalName: "Stavby Novák s.r.o.",
        vatRegime: "platce",
        vat_regime: "platce",
        vatRegisteredFrom: "2020-01-01",
        slug: "ukradeny-slug",
        isDemo: "on",
      }),
    )

    const after = await readCard(org)
    expect(after.vatRegime).toBe(before.vatRegime)
    expect(after.vatRegisteredFrom).toBe(before.vatRegisteredFrom)
    expect(after.slug).toBe(before.slug)
  })

  it("clears a nullable field the owner deliberately emptied", async () => {
    as(org.members.owner.headers)
    await actions.updateCompanyAction(
      IDLE,
      fd({ orgSlug: org.slug, ...MINIMAL_SAVE, contactPhone: "+420123456789" }),
    )
    expect((await readCard(org)).contactPhone).toBe("+420123456789")

    as(org.members.owner.headers)
    await actions.updateCompanyAction(
      IDLE,
      fd({ orgSlug: org.slug, ...MINIMAL_SAVE, contactPhone: "" }),
    )
    expect((await readCard(org)).contactPhone).toBeNull()
  })
})

describe("lookupAresAction — suggest, never write", () => {
  it("returns suggestions and changes no identity column", async () => {
    as(org.members.owner.headers)
    await actions.updateCompanyAction(
      IDLE,
      fd({ orgSlug: org.slug, legalName: "Staré jméno", ico: "25012345" }),
    )
    const before = await readCard(org)

    as(org.members.owner.headers)
    const result = await actions.lookupAresAction(
      IDLE,
      fd({ orgSlug: org.slug, ico: "25012345" }),
    )

    expect(result.status).toBe("suggestions")
    if (result.status !== "suggestions") throw new Error("unreachable")
    expect(result.suggestions.map((s) => s.field)).toContain("legalName")
    expect(result.cached).toBe(false)

    const after = await readCard(org)
    // Only the stamp moved.
    expect(after.legalName).toBe(before.legalName)
    expect(after.registeredCity).toBe(before.registeredCity)
    expect(after.dic).toBe(before.dic)
    expect(after.aresFetchedAt).not.toBeNull()
  })

  it("left-pads the IČO before asking the registry", async () => {
    as(org.members.owner.headers)
    await actions.lookupAresAction(IDLE, fd({ orgSlug: org.slug, ico: "45" }))
    expect(registry.calls).toEqual(["00000045"])
  })

  it("reports a cache hit as one", async () => {
    registry.result = { ok: true, profile: profile(), cached: true }
    as(org.members.owner.headers)
    const result = await actions.lookupAresAction(
      IDLE,
      fd({ orgSlug: org.slug, ico: "25012345" }),
    )
    expect(result).toMatchObject({ status: "suggestions", cached: true })
  })

  it("keeps the form editable when ARES is down, and does not stamp", async () => {
    as(org.members.owner.headers)
    await actions.updateCompanyAction(
      IDLE,
      fd({ orgSlug: org.slug, ...MINIMAL_SAVE }),
    )
    const before = await readCard(org)

    registry.result = { ok: false, reason: "unavailable" }
    as(org.members.owner.headers)
    const result = await actions.lookupAresAction(
      IDLE,
      fd({ orgSlug: org.slug, ico: "25012345" }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorAresUnavailable",
    })

    // A failed call told the office nothing; stamping it would make the card
    // claim a reconciliation that never happened.
    expect((await readCard(org)).aresFetchedAt).toBe(before.aresFetchedAt)
  })

  it("distinguishes an unknown IČO from an outage", async () => {
    registry.result = { ok: false, reason: "not_found" }
    as(org.members.owner.headers)
    expect(
      await actions.lookupAresAction(
        IDLE,
        fd({ orgSlug: org.slug, ico: "25012345" }),
      ),
    ).toEqual({ status: "error", error: "nastaveni.errorAresNotFound" })
  })

  it("refuses without an IČO instead of calling the registry", async () => {
    as(org.members.owner.headers)
    expect(
      await actions.lookupAresAction(IDLE, fd({ orgSlug: org.slug, ico: "" })),
    ).toEqual({ status: "error", error: "nastaveni.errorIcoRequired" })
    expect(registry.calls).toEqual([])

    as(org.members.owner.headers)
    expect(
      await actions.lookupAresAction(
        IDLE,
        fd({ orgSlug: org.slug, ico: "12345678901" }),
      ),
    ).toEqual({ status: "error", error: "nastaveni.errorIcoInvalid" })
    expect(registry.calls).toEqual([])
  })
})

describe("acceptAresAction — per-field accept", () => {
  beforeEach(async () => {
    // A known starting card, so every assertion below is about the accept.
    as(org.members.owner.headers)
    await actions.updateCompanyAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        legalName: "Staré jméno",
        ico: "25012345",
        registeredCity: "Brno",
      }),
    )
  })

  it("writes ONLY the accepted field", async () => {
    as(org.members.owner.headers)
    const result = await actions.acceptAresAction(
      IDLE,
      fd({ orgSlug: org.slug, ico: "25012345", accept: ["legalName"] }),
    )
    expect(result).toMatchObject({
      status: "suggestions",
      message: "nastaveni.okAresApplied",
    })

    const card = await readCard(org)
    expect(card.legalName).toBe("Stavby Novák s.r.o.")
    // ARES also had a city, a street, a DIČ and a spisová značka to offer. None
    // of them was ticked, so none of them moved.
    expect(card.registeredCity).toBe("Brno")
    expect(card.registeredStreet).toBeNull()
    expect(card.dic).toBeNull()
    expect(card.courtFileNumber).toBeNull()
  })

  it("returns the suggestions that REMAIN, so the panel needs no second state", async () => {
    as(org.members.owner.headers)
    const result = await actions.acceptAresAction(
      IDLE,
      fd({ orgSlug: org.slug, ico: "25012345", accept: ["legalName"] }),
    )
    expect(result.status).toBe("suggestions")
    if (result.status !== "suggestions") throw new Error("unreachable")

    // The accepted field now equals what ARES said, so it cannot still be a
    // suggestion; the ones nobody ticked are still on offer.
    expect(result.suggestions.some((s) => s.field === "legalName")).toBe(false)
    expect(result.suggestions.some((s) => s.field === "registeredCity")).toBe(
      true,
    )
  })

  it("writes every field on 'přijmout vše', without being told which", async () => {
    // `intent=acceptAll` carries no field names at all — the server accepts
    // every suggestion it just derived, so "accept all" cannot drift from
    // "accept each".
    as(org.members.owner.headers)
    const result = await actions.acceptAresAction(
      IDLE,
      fd({ orgSlug: org.slug, ico: "25012345", intent: "acceptAll" }),
    )
    expect(result).toMatchObject({
      status: "suggestions",
      message: "nastaveni.okAresApplied",
    })

    const card = await readCard(org)
    expect(card.legalName).toBe("Stavby Novák s.r.o.")
    expect(card.dic).toBe("CZ25012345")
    expect(card.registeredStreet).toBe("Jankovcova 1522/53")
    expect(card.registeredCity).toBe("Praha")
    expect(card.registeredPostalCode).toBe("17000")
    expect(card.taxOfficeCode).toBe("451")
    expect(card.courtFileNumber).toBe("C 12345, Městský soud v Praze")

    // Nothing is left to suggest, and the VAT regime is still untouched.
    if (result.status !== "suggestions") throw new Error("unreachable")
    expect(result.suggestions).toEqual([])
  })

  it("'přijmout vše' still cannot reach the VAT regime", async () => {
    const before = await readCard(org)
    as(org.members.owner.headers)
    await actions.acceptAresAction(
      IDLE,
      fd({ orgSlug: org.slug, ico: "25012345", intent: "acceptAll" }),
    )
    const after = await readCard(org)
    expect(after.vatRegime).toBe(before.vatRegime)
    expect(after.vatRegisteredFrom).toBe(before.vatRegisteredFrom)
  })

  it("cannot be made to write a value the registry did not give", async () => {
    // The POST carries NAMES only. A hand-built body that also carries values
    // is writing nothing but its own names — the server re-derives the values.
    as(org.members.owner.headers)
    await actions.acceptAresAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        ico: "25012345",
        accept: ["legalName"],
        legalName: "Podvrh s.r.o.",
        registeredCity: "Ostrava",
      }),
    )

    const card = await readCard(org)
    expect(card.legalName).toBe("Stavby Novák s.r.o.")
    expect(card.registeredCity).toBe("Brno")
  })

  it("ignores a field name that is not an ARES field", async () => {
    as(org.members.owner.headers)
    const result = await actions.acceptAresAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        ico: "25012345",
        accept: ["vatRegime", "slug", "ico", "__proto__"],
      }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorNothingAccepted",
    })
  })

  it("refuses when nothing was ticked", async () => {
    as(org.members.owner.headers)
    expect(
      await actions.acceptAresAction(
        IDLE,
        fd({ orgSlug: org.slug, ico: "25012345" }),
      ),
    ).toEqual({ status: "error", error: "nastaveni.errorNothingAccepted" })
  })

  it("never sets the VAT regime, and offers no dic when ARES has none", async () => {
    // The rule the spec states twice: `dic: null` must not be read as "not a
    // payer". There is no suggestion to accept, and `vat_regime` is not a field
    // this path can name at all.
    registry.result = {
      ok: true,
      profile: profile({ dic: null }),
      cached: false,
    }
    const before = await readCard(org)

    as(org.members.owner.headers)
    const suggested = await actions.lookupAresAction(
      IDLE,
      fd({ orgSlug: org.slug, ico: "25012345" }),
    )
    expect(suggested.status).toBe("suggestions")
    if (suggested.status !== "suggestions") throw new Error("unreachable")
    expect(suggested.suggestions.some((s) => s.field === "dic")).toBe(false)

    as(org.members.owner.headers)
    await actions.acceptAresAction(
      IDLE,
      fd({ orgSlug: org.slug, ico: "25012345", accept: ["dic", "vatRegime"] }),
    )

    const after = await readCard(org)
    expect(after.dic).toBe(before.dic)
    expect(after.vatRegime).toBe(before.vatRegime)
    expect(after.vatRegisteredFrom).toBe(before.vatRegisteredFrom)
  })

  it("reports 'nothing to change' rather than an error when the book already agrees", async () => {
    as(org.members.owner.headers)
    await actions.acceptAresAction(
      IDLE,
      fd({ orgSlug: org.slug, ico: "25012345", accept: ["legalName"] }),
    )

    // Second time: the field no longer differs, so there is no suggestion for
    // it — an ordinary race, not a failure.
    as(org.members.owner.headers)
    expect(
      await actions.acceptAresAction(
        IDLE,
        fd({ orgSlug: org.slug, ico: "25012345", accept: ["legalName"] }),
      ),
    ).toMatchObject({
      status: "suggestions",
      message: "nastaveni.okAresNoChange",
    })
  })

  it("writes nothing when ARES is unavailable", async () => {
    const before = await readCard(org)
    registry.result = { ok: false, reason: "unavailable" }

    as(org.members.owner.headers)
    expect(
      await actions.acceptAresAction(
        IDLE,
        fd({ orgSlug: org.slug, ico: "25012345", accept: ["legalName"] }),
      ),
    ).toEqual({ status: "error", error: "nastaveni.errorAresUnavailable" })

    expect((await readCard(org)).legalName).toBe(before.legalName)
  })
})
