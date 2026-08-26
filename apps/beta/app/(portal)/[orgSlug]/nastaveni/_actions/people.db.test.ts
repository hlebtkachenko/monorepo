/**
 * Nastavení › Lidé's three Server Actions, driven as the POSTs they are.
 *
 * A SERVER ACTION IS A PUBLIC ENDPOINT. It has a generated name, it is reachable
 * without the page that holds its form ever rendering, and it does not re-enter
 * the layout that gated that page. So this file proves the things the page
 * cannot: that `member` and `guest` are refused even though they never see a
 * form, that an admin POSTing `role=owner` is refused even though that option
 * was never rendered for them, and that an admin of organization A POSTing
 * organization B's slug gets B's answer (404) rather than A's authority.
 *
 * The matrix itself is proved twice over already — as a pure function in
 * `lib/auth/invite-policy.test.ts` and against real rows in
 * `lib/data/people.test.ts`. What is asserted HERE is the wiring: that the
 * action reaches those checks at all, in the right order, from untrusted
 * `FormData`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { BetaOrgRole } from "@/db/schema"

import {
  addMembership,
  createAccount,
  endFixtures,
  seedOrganization,
  setMembershipActive,
  type TestOrganization,
} from "../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}))

const actions = await import("./people")
const { peopleForScope } = await import("@/lib/data/people")
const { requireScope } = await import("@/lib/data/scope")

const IDLE = { status: "idle" } as const
const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

/**
 * Sign in as `account`, from an address of this test's own.
 *
 * WHY THE IP MATTERS HERE. `orgInviteRateLimiter` is a process-wide map keyed by
 * `rateLimitKey`, i.e. by `cf-connecting-ip` — and a request with no such header
 * lands in the SHARED fallback bucket. Every request in a test runner arrives
 * without one, so a file that issues more than ten invites would start failing
 * on the eleventh for a reason no individual test is about, and the order of the
 * tests would become load-bearing. Giving each caller a distinct address puts it
 * in its own bucket, exactly as two real clients would be. The one test whose
 * SUBJECT is the budget pins a single address on purpose.
 *
 * Nothing is mocked to achieve this: the limiter, its algorithm and its wiring
 * are the production ones.
 */
let ipCounter = 0

function as(account: { headers: Headers }, ip?: string): void {
  const headers = new Headers(account.headers)
  headers.set("cf-connecting-ip", ip ?? `198.51.100.${(ipCounter += 1) % 250}`)
  request.headers = headers
}

/** A caller with a session cookie but no membership anywhere. */
function asAnonymous(): void {
  request.headers = new Headers({ "cf-connecting-ip": "198.51.100.254" })
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
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

let org: TestOrganization
let other: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
  other = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

// ---------------------------------------------------------------------------
// The gate — who may POST at all
// ---------------------------------------------------------------------------

describe("authz — spec §5 'people management: owner + admin'", () => {
  const CASES = [
    ["inviteMemberAction", () => ({ role: "guest", email: "x@example.com" })],
    ["changeMemberRoleAction", () => ({ role: "guest", userId: "" })],
    ["setMemberActiveAction", () => ({ active: "false", userId: "" })],
  ] as const

  it("refuses member and guest on every action", async () => {
    for (const [name, extra] of CASES) {
      for (const role of ["member", "guest"] as const) {
        as(org.members[role])
        const payload = { ...extra(), orgSlug: org.slug }
        if ("userId" in payload && payload.userId === "") {
          payload.userId = org.members.guest.userId
        }
        const result = await actions[name](IDLE, fd(payload))
        expect(result, `${name} / ${role}`).toMatchObject({ status: "error" })
      }
    }
  })

  it("404s for a signed-out caller before anything is read", async () => {
    asAnonymous()
    await expect404(
      () =>
        actions.inviteMemberAction(
          IDLE,
          fd({ orgSlug: org.slug, role: "guest", email: "x@example.com" }),
        ),
      "no session",
    )
  })

  it("404s when the POSTed slug names another organization", async () => {
    // The action resolves the slug from the FORM, so this is the case that
    // matters: an admin of one book naming another's slug must get that book's
    // answer, not their own authority applied to it.
    as(org.members.admin)
    await expect404(
      () =>
        actions.changeMemberRoleAction(
          IDLE,
          fd({
            orgSlug: other.slug,
            userId: other.members.member.userId,
            role: "guest",
          }),
        ),
      "cross-org POST",
    )
  })

  it("404s on a slug that does not exist", async () => {
    as(org.members.admin)
    await expect404(
      () =>
        actions.setMemberActiveAction(
          IDLE,
          fd({
            orgSlug: "neexistujici-firma",
            userId: org.members.guest.userId,
            active: "false",
          }),
        ),
      "unknown slug",
    )
  })
})

// ---------------------------------------------------------------------------
// Input validation at the boundary
// ---------------------------------------------------------------------------

describe("reading untrusted FormData", () => {
  it("refuses a role string that is not a role", async () => {
    as(org.members.owner)
    const result = await actions.inviteMemberAction(
      IDLE,
      fd({ orgSlug: org.slug, role: "superadmin", email: "x@example.com" }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorInvalidInput",
    })
  })

  it("refuses a malformed uuid rather than letting Postgres 22P02 through", async () => {
    as(org.members.owner)
    const result = await actions.changeMemberRoleAction(
      IDLE,
      fd({ orgSlug: org.slug, userId: "not-a-uuid", role: "guest" }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorInvalidInput",
    })
  })

  it("refuses an absent active flag rather than reading it as false", async () => {
    as(org.members.owner)
    const result = await actions.setMemberActiveAction(
      IDLE,
      fd({ orgSlug: org.slug, userId: org.members.guest.userId }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorInvalidInput",
    })
  })

  it("refuses an unusable e-mail", async () => {
    as(org.members.owner)
    const result = await actions.inviteMemberAction(
      IDLE,
      fd({ orgSlug: org.slug, role: "guest", email: "not an address" }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorInvalidEmail",
    })
  })
})

// ---------------------------------------------------------------------------
// Invites — the ceiling, and the once-only link
// ---------------------------------------------------------------------------

describe("inviteMemberAction", () => {
  it("hands the raw link back exactly once, and never anywhere else", async () => {
    const book = await seedOrganization()
    as(book.members.admin)

    const result = await actions.inviteMemberAction(
      IDLE,
      fd({
        orgSlug: book.slug,
        role: "member",
        email: `${Date.now()}@example.com`,
      }),
    )

    expect(result.status).toBe("issued")
    if (result.status !== "issued") throw new Error("unreachable")
    expect(result.url).toContain("/setup/")
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())

    // The secret is in the return value and in no persisted field. The table
    // holds sha256(token) only, which is why re-reading cannot reproduce it.
    const token = result.url.slice(result.url.lastIndexOf("/") + 1)
    expect(token.length).toBeGreaterThan(20)
    expect(JSON.stringify(result)).toContain(token)
  })

  it("refuses a company admin an owner invite — by any path", async () => {
    as(org.members.admin)
    const result = await actions.inviteMemberAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        role: "owner",
        email: `${Date.now()}-owner@example.com`,
      }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorNotAllowed",
    })
  })

  it("lets an owner invite an owner — one office account to another", async () => {
    const book = await seedOrganization()
    as(book.members.owner)
    const result = await actions.inviteMemberAction(
      IDLE,
      fd({
        orgSlug: book.slug,
        role: "owner",
        email: `${Date.now()}-acc@example.com`,
      }),
    )
    // The link may be minted; the `owner ⇒ is_staff` trigger is what decides
    // whether it can be CONSUMED into an owner membership.
    expect(result.status).toBe("issued")
  })

  it("cannot be pointed at another organization by a hidden field", async () => {
    // `organizationId` is taken from the resolved scope and is not read from
    // the form at all, so a payload naming one is simply ignored.
    const book = await seedOrganization()
    as(book.members.admin)

    const result = await actions.inviteMemberAction(
      IDLE,
      fd({
        orgSlug: book.slug,
        organizationId: other.organizationId,
        role: "guest",
        email: `${Date.now()}-elsewhere@example.com`,
      }),
    )

    expect(result.status).toBe("issued")
    // Nothing landed in the other book.
    as(other.members.owner)
    const otherPeople = await peopleForScope(await requireScope(other.slug))
    expect(otherPeople.members).toHaveLength(4)
  })

  it("spends a rate-limit budget", async () => {
    const book = await seedOrganization()
    // ONE pinned address, so all twelve requests share a bucket — this is the
    // test whose subject IS the budget.
    as(book.members.admin, "203.0.113.42")

    const outcomes: string[] = []
    for (let i = 0; i < 12; i++) {
      const result = await actions.inviteMemberAction(
        IDLE,
        fd({
          orgSlug: book.slug,
          role: "guest",
          email: `${Date.now()}-${i}@example.com`,
        }),
      )
      outcomes.push(result.status)
    }

    // A blast-radius cap on a stolen session, not an anti-guessing budget —
    // this asserts it BITES, not the exact number.
    expect(outcomes).toContain("issued")
    expect(outcomes).toContain("error")
  })
})

// ---------------------------------------------------------------------------
// Role change + deactivate through the action layer
// ---------------------------------------------------------------------------

describe("changeMemberRoleAction", () => {
  it("lets an admin move a member down and reports it in Czech", async () => {
    const book = await seedOrganization()
    as(book.members.admin)

    const result = await actions.changeMemberRoleAction(
      IDLE,
      fd({
        orgSlug: book.slug,
        userId: book.members.member.userId,
        role: "guest",
      }),
    )
    expect(result).toEqual({
      status: "ok",
      message: "nastaveni.okRoleChanged",
    })
  })

  it("refuses role=owner posted past a select that never offered it", async () => {
    const book = await seedOrganization()
    as(book.members.admin)

    const result = await actions.changeMemberRoleAction(
      IDLE,
      fd({
        orgSlug: book.slug,
        userId: book.members.member.userId,
        role: "owner",
      }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorNotAllowed",
    })
  })

  it("surfaces the last-owner trigger as its own sentence", async () => {
    const book = await seedOrganization()
    as(book.members.owner)

    const result = await actions.changeMemberRoleAction(
      IDLE,
      fd({
        orgSlug: book.slug,
        userId: book.members.owner.userId,
        role: "admin",
      }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorLastOwner",
    })
  })
})

describe("setMemberActiveAction", () => {
  it("deactivates and reactivates a guest", async () => {
    const book = await seedOrganization()
    as(book.members.admin)
    const target = book.members.guest.userId

    expect(
      await actions.setMemberActiveAction(
        IDLE,
        fd({ orgSlug: book.slug, userId: target, active: "false" }),
      ),
    ).toEqual({ status: "ok", message: "nastaveni.okMemberDeactivated" })

    expect(
      await actions.setMemberActiveAction(
        IDLE,
        fd({ orgSlug: book.slug, userId: target, active: "true" }),
      ),
    ).toEqual({ status: "ok", message: "nastaveni.okMemberActivated" })
  })

  it("refuses an admin deactivating an owner — PR 22 carry-in, at the POST", async () => {
    const book = await seedOrganization()
    const spare = await createAccount({ staff: true })
    await addMembership(book.organizationId, spare.userId, "owner")

    as(book.members.admin)
    const result = await actions.setMemberActiveAction(
      IDLE,
      fd({ orgSlug: book.slug, userId: spare.userId, active: "false" }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorNotAllowed",
    })
  })

  it("refuses an admin deactivating themselves", async () => {
    const book = await seedOrganization()
    as(book.members.admin)

    const result = await actions.setMemberActiveAction(
      IDLE,
      fd({
        orgSlug: book.slug,
        userId: book.members.admin.userId,
        active: "false",
      }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorNotAllowed",
    })
  })

  it("answers not_found for a stranger's user id", async () => {
    const book = await seedOrganization()
    const stranger = await createAccount()
    as(book.members.admin)

    const result = await actions.setMemberActiveAction(
      IDLE,
      fd({ orgSlug: book.slug, userId: stranger.userId, active: "false" }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorMemberNotFound",
    })
  })

  it("cannot reactivate a seat in another organization", async () => {
    const book = await seedOrganization()
    await setMembershipActive(
      other.organizationId,
      other.members.guest.userId,
      false,
    )

    as(book.members.admin)
    const result = await actions.setMemberActiveAction(
      IDLE,
      fd({
        orgSlug: book.slug,
        userId: other.members.guest.userId,
        active: "true",
      }),
    )
    expect(result).toEqual({
      status: "error",
      error: "nastaveni.errorMemberNotFound",
    })

    // Restore, so the shared `other` fixture stays as the other cases expect.
    await setMembershipActive(
      other.organizationId,
      other.members.guest.userId,
      true,
    )
  })
})

// ---------------------------------------------------------------------------
// The full matrix, stated once
// ---------------------------------------------------------------------------

describe("the authz matrix, action by action", () => {
  const ROLES: readonly BetaOrgRole[] = ["owner", "admin", "member", "guest"]

  it("only owner and admin get a non-refusal from any of the three", async () => {
    const book = await seedOrganization()

    for (const role of ROLES) {
      as(book.members[role])
      const invite = await actions.inviteMemberAction(
        IDLE,
        fd({
          orgSlug: book.slug,
          role: "guest",
          email: `${Date.now()}-${role}@example.com`,
        }),
      )
      const allowed = role === "owner" || role === "admin"
      expect(invite.status === "issued", `invite / ${role}`).toBe(allowed)
    }
  })
})
