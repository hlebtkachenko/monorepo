/**
 * The /admin office surface, exercised through its real Server Actions.
 *
 * WHY THE ACTIONS AND NOT THE DATA FUNCTIONS. A Server Action is a public POST
 * endpoint with a generated name. It does not run the layout that rendered its
 * form, so "the page is behind `requireOffice()`" says nothing about whether the
 * ACTION is — and the gap between those two sentences is the whole attack. Every
 * case below therefore calls the exported action with a `FormData`, exactly as a
 * hostile POST would, with a real Better Auth session in the headers.
 *
 * WHAT IS REAL: the sessions (the fixtures sign in through Better Auth and hand
 * back the `__Host-` cookie), the database, every trigger. What is mocked:
 * `next/headers`, because a test runner has no HTTP request to read them from,
 * and `next/cache`, because `revalidatePath` needs a render scope that does not
 * exist here and has nothing to do with authorization.
 *
 * THE IP HEADER IS SET PER CALL, and not as decoration: the issuance limiter
 * (`BETA_OFFICE_ISSUE_RATE_LIMIT`) is keyed by client IP, and a suite that
 * issued forty links from one bucket would start failing on the twenty-first
 * for a reason that has nothing to do with what it is testing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  addMembership,
  anonymousHeaders,
  createAccount,
  createOrganization as seedOrganizationRow,
  disableAccount,
  endFixtures,
  seedOrganization,
  type TestAccount,
  type TestOrganization,
} from "../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}))

const { ADMIN_ACTION_IDLE } = await import("@/app/admin/_actions/state")
const organizationActions = await import("@/app/admin/_actions/organizations")
const membershipActions = await import("@/app/admin/_actions/memberships")
const userActions = await import("@/app/admin/_actions/users")
const setupLinkActions = await import("@/app/admin/_actions/setup-links")

const { listOfficeOrganizations, officeOrganization } =
  await import("./organizations")
const { listOrganizationMembers } = await import("./memberships")
const { listOfficeUsers } = await import("./users")
const { listSetupLinks } = await import("./setup-links")
const { forbiddenClientKeys } = await import("../projections")
const { hashSetupToken, issueSetupToken } =
  await import("@/lib/auth/setup-token")
const { unique } = await import("../../../tests/scratch-db")

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

async function expect404(
  run: () => Promise<unknown> | unknown,
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

/** A fresh limiter bucket per call, so the budget never colours a result. */
let ipCounter = 0
function as(headers: Headers): void {
  ipCounter = (ipCounter + 1) % 250
  const next = new Headers(headers)
  next.set("cf-connecting-ip", `203.0.113.${ipCounter + 1}`)
  request.headers = next
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

type Action = (
  previous: typeof ADMIN_ACTION_IDLE,
  formData: FormData,
) => Promise<unknown>

const run = (action: Action, entries: Record<string, string> = {}) =>
  action(ADMIN_ACTION_IDLE, fd(entries))

/** Every write /admin exposes, with a payload that is valid in shape. */
function everyAction(context: {
  organizationId: string
  userId: string
  tokenId: string
}): { name: string; action: Action; entries: Record<string, string> }[] {
  return [
    {
      name: "createOrganizationAction",
      action: organizationActions.createOrganizationAction,
      entries: { slug: unique("probe-"), legalName: "Sonda s.r.o." },
    },
    {
      name: "setOrganizationArchivedAction",
      action: organizationActions.setOrganizationArchivedAction,
      entries: { organizationId: context.organizationId, archived: "true" },
    },
    {
      name: "updateOrganizationSettingsAction",
      action: organizationActions.updateOrganizationSettingsAction,
      entries: { organizationId: context.organizationId, vatRegime: "platce" },
    },
    {
      name: "inviteToOrganizationAction",
      action: membershipActions.inviteToOrganizationAction,
      entries: {
        organizationId: context.organizationId,
        role: "guest",
        email: `${unique("probe")}@example.com`,
      },
    },
    {
      name: "changeMemberRoleAction",
      action: membershipActions.changeMemberRoleAction,
      entries: {
        organizationId: context.organizationId,
        userId: context.userId,
        role: "guest",
      },
    },
    {
      name: "setMemberActiveAction",
      action: membershipActions.setMemberActiveAction,
      entries: {
        organizationId: context.organizationId,
        userId: context.userId,
        active: "false",
      },
    },
    {
      name: "grantOwnerEverywhereAction",
      action: membershipActions.grantOwnerEverywhereAction,
      entries: { userId: context.userId },
    },
    {
      name: "createUserAction",
      action: userActions.createUserAction,
      entries: { email: `${unique("probe")}@example.com`, name: "Sonda" },
    },
    {
      name: "issueUserLinkAction",
      action: userActions.issueUserLinkAction,
      entries: {
        email: `${unique("probe")}@example.com`,
        activated: "false",
      },
    },
    {
      name: "setUserStaffAction",
      action: userActions.setUserStaffAction,
      entries: { userId: context.userId, staff: "true" },
    },
    {
      name: "setUserDisabledAction",
      action: userActions.setUserDisabledAction,
      entries: { userId: context.userId, disabled: "true" },
    },
    {
      name: "revokeSetupLinkAction",
      action: setupLinkActions.revokeSetupLinkAction,
      entries: { tokenId: context.tokenId },
    },
  ]
}

let org: TestOrganization
let staff: TestAccount

beforeAll(async () => {
  org = await seedOrganization()
  staff = await createAccount({ staff: true })
})

afterAll(async () => {
  await endFixtures()
})

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe("every /admin action is gated on is_staff", () => {
  it("refuses every non-staff caller, on every action, with a 404", async () => {
    const actions = everyAction({
      organizationId: org.organizationId,
      userId: org.members.member.userId,
      // A syntactically valid id that does not exist: the gate has to fire
      // before anything looks it up.
      tokenId: "00000000-0000-7000-8000-000000000000",
    })
    // Twelve writes × five callers. The `admin` case is the interesting one:
    // a company admin administers PEOPLE inside their own book and must still
    // be a stranger to the office area, which is above organizations.
    expect(actions).toHaveLength(12)

    const disabledStaff = await createAccount({ staff: true })
    await disableAccount(disabledStaff.userId)

    const callers: { label: string; headers: Headers }[] = [
      { label: "anonymous", headers: anonymousHeaders() },
      { label: "company admin", headers: org.members.admin.headers },
      { label: "company member", headers: org.members.member.headers },
      { label: "guest", headers: org.members.guest.headers },
      { label: "deactivated staff", headers: disabledStaff.headers },
    ]

    for (const caller of callers) {
      for (const entry of actions) {
        as(caller.headers)
        await expect404(
          () => run(entry.action, entry.entries),
          `${caller.label} must not reach ${entry.name}`,
        )
      }
    }
  })

  it("follows a revoked is_staff flag on the very next action", async () => {
    const demoted = await createAccount({ staff: true })

    as(demoted.headers)
    const before = await run(userActions.createUserAction, {
      email: `${unique("ok")}@example.com`,
      name: "Před",
    })
    expect(before).toMatchObject({ status: "issued" })

    as(staff.headers)
    await run(userActions.setUserStaffAction, {
      userId: demoted.userId,
      staff: "false",
    })

    as(demoted.headers)
    await expect404(
      () =>
        run(userActions.createUserAction, {
          email: `${unique("no")}@example.com`,
          name: "Po",
        }),
      "an account that is no longer staff",
    )
  })

  it("admits office staff who belong to no organization at all", async () => {
    // /admin is above organizations: a newly provisioned office account has to
    // reach it before anything has been granted to it.
    const stranger = await createAccount({ staff: true })
    as(stranger.headers)
    await expect(listOfficeOrganizations(await office())).resolves.toBeDefined()
  })
})

/** Resolve an OfficeScope for the current request headers. */
async function office() {
  const { requireOffice } = await import("../scope")
  return requireOffice()
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

describe("creating an organization", () => {
  it("seats the creator as owner, so the book is never ownerless", async () => {
    as(staff.headers)
    const slug = unique("nova-")
    const result = await run(organizationActions.createOrganizationAction, {
      slug,
      legalName: "Nová firma s.r.o.",
      ico: "12345678",
      vatRegime: "platce",
    })
    expect(result).toMatchObject({
      status: "ok",
      message: "admin.okOrganizationCreated",
    })

    const created = (await listOfficeOrganizations(await office())).find(
      (row) => row.slug === slug,
    )
    expect(created).toBeDefined()
    expect(created?.ownerCount).toBe(1)
    expect(created?.vatRegime).toBe("platce")

    const members = await listOrganizationMembers(await office(), created!.id)
    expect(members).toHaveLength(1)
    expect(members[0]?.userId).toBe(staff.userId)
    expect(members[0]?.role).toBe("owner")
  })

  it("refuses every reserved slug", async () => {
    as(staff.headers)
    for (const slug of [
      "admin",
      "api",
      "healthz",
      "sign-in",
      "setup",
      "reset",
      "_next",
      "ADMIN",
    ]) {
      const result = await run(organizationActions.createOrganizationAction, {
        slug,
        legalName: "Kolize s.r.o.",
        vatRegime: "neplatce",
      })
      // `_next` is refused by the FORMAT rule (leading underscore) before the
      // reserved list is consulted; both are refusals, which is the point.
      expect(result, slug).toMatchObject({ status: "error" })
      expect(
        ["admin.errorSlugReserved", "admin.errorSlugInvalid"],
        slug,
      ).toContain((result as { error: string }).error)
    }
  })

  it("refuses a malformed slug, a taken slug, a bad IČO and an empty name", async () => {
    as(staff.headers)
    const taken = unique("obsazeno-")
    await run(organizationActions.createOrganizationAction, {
      slug: taken,
      legalName: "První s.r.o.",
      vatRegime: "neplatce",
    })

    const cases: [Record<string, string>, string][] = [
      [{ slug: "-pomlcka", legalName: "X" }, "admin.errorSlugInvalid"],
      [{ slug: "pomlcka-", legalName: "X" }, "admin.errorSlugInvalid"],
      [{ slug: "s podtrzitkem", legalName: "X" }, "admin.errorSlugInvalid"],
      [{ slug: "s_podtrzitkem", legalName: "X" }, "admin.errorSlugInvalid"],
      [{ slug: "../etc/passwd", legalName: "X" }, "admin.errorSlugInvalid"],
      [{ slug: taken, legalName: "Druhá s.r.o." }, "admin.errorSlugTaken"],
      [
        { slug: unique("ico-"), legalName: "X", ico: "1234" },
        "admin.errorIcoInvalid",
      ],
      [{ slug: unique("bez-"), legalName: "   " }, "admin.errorNameRequired"],
    ]

    for (const [entries, error] of cases) {
      const result = await run(organizationActions.createOrganizationAction, {
        vatRegime: "neplatce",
        ...entries,
      })
      expect(result, JSON.stringify(entries)).toMatchObject({
        status: "error",
        error,
      })
    }
  })

  it("refuses an unknown VAT regime instead of quietly defaulting", async () => {
    // A silent `?? "neplatce"` turns a stale form, a hand-built POST or a
    // future enum member into a book marked as a non-payer — and the VAT
    // regime is the fact the whole Daně module keys off.
    as(staff.headers)
    for (const vatRegime of ["", "osvobozeny", "PLATCE"]) {
      expect(
        await run(organizationActions.createOrganizationAction, {
          slug: unique("dph-neznamy-"),
          legalName: "Neznámý režim s.r.o.",
          vatRegime,
        }),
        vatRegime || "<empty>",
      ).toMatchObject({ status: "error", error: "admin.errorInvalidInput" })
    }
  })

  it("normalizes the case of a slug rather than refusing it", async () => {
    // The column stores lowercase and `requireScope` folds nothing, so an
    // uppercase slug typed into the form has exactly one sane reading.
    as(staff.headers)
    const slug = unique("velka-")
    expect(
      await run(organizationActions.createOrganizationAction, {
        slug: `  ${slug.toUpperCase()}  `,
        legalName: "Velká s.r.o.",
        vatRegime: "neplatce",
      }),
    ).toMatchObject({ status: "ok" })

    const listed = await listOfficeOrganizations(await office())
    expect(listed.some((row) => row.slug === slug)).toBe(true)
    expect(listed.some((row) => row.slug === slug.toUpperCase())).toBe(false)
  })
})

describe("organization settings", () => {
  it("archives and unarchives, and clears the VAT date on neplátce", async () => {
    as(staff.headers)
    const slug = unique("nastaveni-")
    await run(organizationActions.createOrganizationAction, {
      slug,
      legalName: "Nastavení s.r.o.",
      vatRegime: "neplatce",
    })
    const created = (await listOfficeOrganizations(await office())).find(
      (row) => row.slug === slug,
    )!

    await run(organizationActions.updateOrganizationSettingsAction, {
      organizationId: created.id,
      vatRegime: "platce",
      vatRegisteredFrom: "2026-01-01",
      isDemo: "on",
    })
    let current = await officeOrganization(await office(), created.id)
    expect(current?.vatRegime).toBe("platce")
    expect(current?.isDemo).toBe(true)

    // Back to neplátce: the registration date must not survive, or the identity
    // card renders a lie.
    await run(organizationActions.updateOrganizationSettingsAction, {
      organizationId: created.id,
      vatRegime: "neplatce",
      vatRegisteredFrom: "2026-01-01",
    })
    current = await officeOrganization(await office(), created.id)
    expect(current?.vatRegime).toBe("neplatce")
    expect(current?.isDemo).toBe(false)

    await run(organizationActions.setOrganizationArchivedAction, {
      organizationId: created.id,
      archived: "true",
    })
    expect(
      (await officeOrganization(await office(), created.id))?.archived,
    ).toBe(true)

    await run(organizationActions.setOrganizationArchivedAction, {
      organizationId: created.id,
      archived: "false",
    })
    expect(
      (await officeOrganization(await office(), created.id))?.archived,
    ).toBe(false)
  })

  /**
   * The regression the Advisor caught. `OfficeOrganizationRow` had no
   * `vatRegisteredFrom`, so the date input rendered with no `defaultValue`,
   * so every save posted an empty date — and the regime and its date are
   * written as a PAIR (`organizationVatPayload`), so an empty date reads as
   * "clear it". Toggling the demo flag silently wiped the registration date of
   * a plátce, which is a legal fact on the identity card.
   */
  it("keeps the VAT registration date through an unrelated save", async () => {
    as(staff.headers)
    const slug = unique("dph-")
    await run(organizationActions.createOrganizationAction, {
      slug,
      legalName: "Plátce s.r.o.",
      vatRegime: "neplatce",
    })
    const created = (await listOfficeOrganizations(await office())).find(
      (row) => row.slug === slug,
    )!

    await run(organizationActions.updateOrganizationSettingsAction, {
      organizationId: created.id,
      vatRegime: "platce",
      vatRegisteredFrom: "2026-04-01",
    })
    expect(
      (await officeOrganization(await office(), created.id))?.vatRegisteredFrom,
    ).toBe("2026-04-01")

    // The save the office actually makes next: flip `is_demo`, leaving the VAT
    // fields exactly as the form rendered them. The date must survive.
    const beforeToggle = await officeOrganization(await office(), created.id)
    await run(organizationActions.updateOrganizationSettingsAction, {
      organizationId: created.id,
      vatRegime: beforeToggle!.vatRegime,
      // What the form now posts, because the input has a defaultValue.
      vatRegisteredFrom: beforeToggle!.vatRegisteredFrom ?? "",
      isDemo: "on",
    })

    const after = await officeOrganization(await office(), created.id)
    expect(after?.isDemo).toBe(true)
    expect(after?.vatRegime).toBe("platce")
    expect(after?.vatRegisteredFrom).toBe("2026-04-01")
  })

  it("clears the registration date when the regime goes back to neplátce", async () => {
    // The other direction is still deliberate: a neplátce carrying a
    // registration date is an identity card that lies.
    as(staff.headers)
    const slug = unique("zpet-")
    await run(organizationActions.createOrganizationAction, {
      slug,
      legalName: "Zpět s.r.o.",
      vatRegime: "platce",
    })
    const created = (await listOfficeOrganizations(await office())).find(
      (row) => row.slug === slug,
    )!

    await run(organizationActions.updateOrganizationSettingsAction, {
      organizationId: created.id,
      vatRegime: "platce",
      vatRegisteredFrom: "2026-04-01",
    })
    await run(organizationActions.updateOrganizationSettingsAction, {
      organizationId: created.id,
      vatRegime: "neplatce",
      vatRegisteredFrom: "2026-04-01",
    })

    const after = await officeOrganization(await office(), created.id)
    expect(after?.vatRegime).toBe("neplatce")
    expect(after?.vatRegisteredFrom).toBeNull()
  })

  it("refuses a payload whose enum or id is not one of the known values", async () => {
    as(staff.headers)
    for (const entries of [
      { organizationId: org.organizationId, vatRegime: "osvobozeny" },
      { organizationId: "not-a-uuid", vatRegime: "platce" },
      { organizationId: org.organizationId, vatRegime: "" },
    ]) {
      expect(
        await run(
          organizationActions.updateOrganizationSettingsAction,
          entries,
        ),
        JSON.stringify(entries),
      ).toMatchObject({ status: "error", error: "admin.errorInvalidInput" })
    }
  })
})

// ---------------------------------------------------------------------------
// Memberships and the role matrix
// ---------------------------------------------------------------------------

describe("membership role changes", () => {
  it("changes a role, and refuses to promote a non-staff account to owner", async () => {
    const book = await seedOrganization()
    as(staff.headers)

    expect(
      await run(membershipActions.changeMemberRoleAction, {
        organizationId: book.organizationId,
        userId: book.members.guest.userId,
        role: "member",
      }),
    ).toMatchObject({ status: "ok", message: "admin.okRoleChanged" })

    // `owner ⇒ is_staff` is a database trigger; the action translates its
    // refusal instead of leaking a 500.
    expect(
      await run(membershipActions.changeMemberRoleAction, {
        organizationId: book.organizationId,
        userId: book.members.admin.userId,
        role: "owner",
      }),
    ).toMatchObject({
      status: "error",
      error: "admin.errorOwnerRequiresStaff",
    })
  })

  it("refuses to demote the last owner", async () => {
    const book = await seedOrganization()
    as(staff.headers)

    expect(
      await run(membershipActions.changeMemberRoleAction, {
        organizationId: book.organizationId,
        userId: book.members.owner.userId,
        role: "admin",
      }),
    ).toMatchObject({ status: "error", error: "admin.errorLastOwner" })

    expect(
      await run(membershipActions.setMemberActiveAction, {
        organizationId: book.organizationId,
        userId: book.members.owner.userId,
        active: "false",
      }),
    ).toMatchObject({ status: "error", error: "admin.errorLastOwner" })
  })

  it("reports a membership that does not exist as not found, not as success", async () => {
    const outsider = await createAccount()
    as(staff.headers)
    expect(
      await run(membershipActions.changeMemberRoleAction, {
        organizationId: org.organizationId,
        userId: outsider.userId,
        role: "guest",
      }),
    ).toMatchObject({ status: "error", error: "admin.errorNotFound" })
  })

  it("refuses a role, an id or a flag that is not a known value", async () => {
    as(staff.headers)
    for (const entries of [
      {
        organizationId: org.organizationId,
        userId: org.members.guest.userId,
        role: "superuser",
      },
      {
        organizationId: org.organizationId,
        userId: "nope",
        role: "guest",
      },
    ]) {
      expect(
        await run(membershipActions.changeMemberRoleAction, entries),
        JSON.stringify(entries),
      ).toMatchObject({ status: "error", error: "admin.errorInvalidInput" })
    }

    expect(
      await run(membershipActions.setMemberActiveAction, {
        organizationId: org.organizationId,
        userId: org.members.guest.userId,
        active: "yes-please",
      }),
    ).toMatchObject({ status: "error", error: "admin.errorInvalidInput" })
  })
})

describe("the admin-never-owner rule, from the organization door", () => {
  /**
   * /admin issues as office staff, so the matrix's sharp edge is only visible
   * through the ORGANIZATION issuer — the shape Nastavení › Lidé (PR 22) will
   * use. It is asserted here because the action layer is shared: the same
   * `issueSetupToken` serves both doors, and the rule has to hold in the one
   * that is not privileged.
   */
  it("refuses a company admin an owner grant, and the database refuses too", async () => {
    const book = await seedOrganization()
    const admin = book.members.admin

    const bySignature = await issueSetupToken({
      purpose: "org_invite",
      email: `${unique("esc")}@example.com`,
      organizationId: book.organizationId,
      grantedRole: "owner",
      issuer: {
        kind: "organization",
        userId: admin.userId,
        organizationId: book.organizationId,
        role: "admin",
      },
      ip: null,
      userAgent: null,
    })
    expect(bySignature).toEqual({ ok: false, reason: "role_not_allowed" })

    // And if the policy check were ever removed, the issuance trigger is the
    // floor: it refuses an owner grant from a non-staff issuer outright. Proved
    // by claiming to be an owner and still being refused, because the trigger
    // reads `app_user.is_staff` rather than anything the caller says.
    const byTrigger = await issueSetupToken({
      purpose: "org_invite",
      email: `${unique("esc")}@example.com`,
      organizationId: book.organizationId,
      grantedRole: "owner",
      issuer: {
        kind: "organization",
        userId: admin.userId,
        organizationId: book.organizationId,
        role: "owner",
      },
      ip: null,
      userAgent: null,
    })
    expect(byTrigger).toEqual({ ok: false, reason: "rejected" })
  })

  it("lets a company admin invite admin, member and guest into their own book", async () => {
    const book = await seedOrganization()
    for (const role of ["admin", "member", "guest"] as const) {
      const result = await issueSetupToken({
        purpose: "org_invite",
        email: `${unique("ok")}@example.com`,
        organizationId: book.organizationId,
        grantedRole: role,
        issuer: {
          kind: "organization",
          userId: book.members.admin.userId,
          organizationId: book.organizationId,
          role: "admin",
        },
        ip: null,
        userAgent: null,
      })
      expect(result.ok, role).toBe(true)
    }
  })

  it("refuses an organization issuer aiming at another organization", async () => {
    const home = await seedOrganization()
    const foreign = await seedOrganization()

    expect(
      await issueSetupToken({
        purpose: "org_invite",
        email: `${unique("cross")}@example.com`,
        organizationId: foreign.organizationId,
        grantedRole: "member",
        issuer: {
          kind: "organization",
          userId: home.members.admin.userId,
          organizationId: home.organizationId,
          role: "admin",
        },
        ip: null,
        userAgent: null,
      }),
    ).toEqual({ ok: false, reason: "scope_mismatch" })
  })

  it("refuses a member and a guest any invite at all", async () => {
    const book = await seedOrganization()
    for (const role of ["member", "guest"] as const) {
      expect(
        await issueSetupToken({
          purpose: "org_invite",
          email: `${unique("no")}@example.com`,
          organizationId: book.organizationId,
          grantedRole: "guest",
          issuer: {
            kind: "organization",
            userId: book.members[role].userId,
            organizationId: book.organizationId,
            role,
          },
          ip: null,
          userAgent: null,
        }),
        role,
      ).toEqual({ ok: false, reason: "purpose_not_allowed" })
    }
  })
})

describe("owner ve všech", () => {
  it("seats a staff account as owner of every live book, skipping archived ones", async () => {
    const live = await seedOrganization()
    const archived = await seedOrganization()
    as(staff.headers)
    await run(organizationActions.setOrganizationArchivedAction, {
      organizationId: archived.organizationId,
      archived: "true",
    })

    const accountant = await createAccount({ staff: true })
    as(staff.headers)
    expect(
      await run(membershipActions.grantOwnerEverywhereAction, {
        userId: accountant.userId,
      }),
    ).toMatchObject({ status: "ok", message: "admin.okOwnerEverywhere" })

    const liveMembers = await listOrganizationMembers(
      await office(),
      live.organizationId,
    )
    expect(liveMembers.find((m) => m.userId === accountant.userId)?.role).toBe(
      "owner",
    )

    const archivedMembers = await listOrganizationMembers(
      await office(),
      archived.organizationId,
    )
    expect(
      archivedMembers.find((m) => m.userId === accountant.userId),
    ).toBeUndefined()
  })

  it("refuses a non-staff or deactivated target, and says which", async () => {
    // Two different preconditions with two different fixes: "make this an
    // office account" versus "this office account is switched off".
    const company = await createAccount()
    const retired = await createAccount({ staff: true })
    await disableAccount(retired.userId)

    as(staff.headers)
    expect(
      await run(membershipActions.grantOwnerEverywhereAction, {
        userId: company.userId,
      }),
    ).toMatchObject({
      status: "error",
      error: "admin.errorOwnerRequiresStaff",
    })

    expect(
      await run(membershipActions.grantOwnerEverywhereAction, {
        userId: retired.userId,
      }),
    ).toMatchObject({
      status: "error",
      error: "admin.errorOwnerRequiresActive",
    })
  })
})

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe("users", () => {
  it("creates an identity with no credential, and hands out its link once", async () => {
    as(staff.headers)
    const email = `${unique("novy")}@example.com`
    const result = await run(userActions.createUserAction, {
      email: email.toUpperCase(),
      name: "  Nový Uživatel  ",
      isStaff: "on",
    })

    expect(result).toMatchObject({ status: "issued" })
    // The address is normalized by the payload builder AND by the DB trigger.
    expect((result as { email: string }).email).toBe(email)

    const created = (await listOfficeUsers(await office())).find(
      (row) => row.email === email,
    )
    expect(created).toBeDefined()
    expect(created?.staff).toBe(true)
    expect(created?.name).toBe("Nový Uživatel")
    // Two halves: /admin writes the identity, the consumed link writes the
    // credential. Until then nobody can sign in as this row.
    expect(created?.activated).toBe(false)
    expect(created?.disabled).toBe(false)
  })

  it("refuses a duplicate address and a malformed one", async () => {
    as(staff.headers)
    const email = `${unique("dup")}@example.com`
    await run(userActions.createUserAction, { email, name: "První" })

    expect(
      await run(userActions.createUserAction, { email, name: "Druhý" }),
    ).toMatchObject({ status: "error", error: "admin.errorEmailTaken" })

    for (const bad of ["", "nope", "a@b", "a b@example.com"]) {
      expect(
        await run(userActions.createUserAction, { email: bad, name: "X" }),
        bad || "<empty>",
      ).toMatchObject({ status: "error", error: "admin.errorInvalidEmail" })
    }
  })

  it("grants and revokes is_staff, and refuses to strip it from an owner", async () => {
    const book = await seedOrganization()
    const person = await createAccount()

    as(staff.headers)
    expect(
      await run(userActions.setUserStaffAction, {
        userId: person.userId,
        staff: "true",
      }),
    ).toMatchObject({ status: "ok", message: "admin.okStaffGranted" })

    expect(
      await run(userActions.setUserStaffAction, {
        userId: person.userId,
        staff: "false",
      }),
    ).toMatchObject({ status: "ok", message: "admin.okStaffRevoked" })

    // The book's owner still owns it, so the flag cannot go.
    expect(
      await run(userActions.setUserStaffAction, {
        userId: book.members.owner.userId,
        staff: "false",
      }),
    ).toMatchObject({ status: "error", error: "admin.errorStaffHoldsOwner" })
  })

  it("refuses to deactivate an organization's last owner", async () => {
    const book = await seedOrganization()
    as(staff.headers)
    expect(
      await run(userActions.setUserDisabledAction, {
        userId: book.members.owner.userId,
        disabled: "true",
      }),
    ).toMatchObject({ status: "error", error: "admin.errorLastOwner" })
  })

  it("chooses the link purpose from the account's own state", async () => {
    as(staff.headers)

    // Never activated → a setup link.
    const provisioned = `${unique("prov")}@example.com`
    await run(userActions.createUserAction, {
      email: provisioned,
      name: "Provisioned",
    })
    const setup = await run(userActions.issueUserLinkAction, {
      email: provisioned,
      activated: "false",
    })
    expect((setup as { url: string }).url).toContain("/setup/")

    // Has a credential → a reset link, on a different route.
    const activated = await createAccount()
    const reset = await run(userActions.issueUserLinkAction, {
      email: activated.email,
      activated: "true",
    })
    expect((reset as { url: string }).url).toContain("/reset/")
  })
})

// ---------------------------------------------------------------------------
// Setup links — the once-only contract
// ---------------------------------------------------------------------------

describe("the one-time link is shown exactly once", () => {
  it("returns the raw token to the caller and to nobody else, ever", async () => {
    const book = await seedOrganization()
    as(staff.headers)

    const email = `${unique("jednou")}@example.com`
    const issued = await run(membershipActions.inviteToOrganizationAction, {
      organizationId: book.organizationId,
      email,
      role: "member",
    })
    expect(issued).toMatchObject({ status: "issued" })

    const url = (issued as { url: string }).url
    const token = url.split("/").pop()!
    expect(token.length).toBeGreaterThan(20)

    // 1. The registry knows the link exists and carries no field for it.
    const registry = await listSetupLinks(await office(), {
      organizationId: book.organizationId,
    })
    const row = registry.find((entry) => entry.email === email)
    expect(row).toBeDefined()
    expect(row?.status).toBe("live")
    expect(row?.role).toBe("member")
    expect(JSON.stringify(registry)).not.toContain(token)
    expect(Object.keys(row!).sort()).toEqual([
      "createdAt",
      "email",
      "expiresAt",
      "id",
      "issuedByEmail",
      "organizationName",
      "purpose",
      "role",
      "status",
    ])

    // 2. Neither does the database: only the hash was ever written, and the
    //    raw value appears in no column of the row.
    const { betaDb } = await import("@/db/client")
    const { sql } = await import("drizzle-orm")
    const stored = await betaDb().execute(
      sql`SELECT * FROM user_setup_token WHERE token_hash = ${hashSetupToken(token)}`,
    )
    expect(stored).toHaveLength(1)
    expect(JSON.stringify(stored)).not.toContain(token)

    // 3. A second read of the registry is still just as blind.
    expect(JSON.stringify(await listSetupLinks(await office()))).not.toContain(
      token,
    )
  })

  it("revokes a live link, and says so when there is nothing left to revoke", async () => {
    as(staff.headers)
    const email = `${unique("zrus")}@example.com`
    await run(membershipActions.inviteToOrganizationAction, {
      organizationId: org.organizationId,
      email,
      role: "guest",
    })

    const registry = await listSetupLinks(await office(), {
      organizationId: org.organizationId,
    })
    const target = registry.find((entry) => entry.email === email)!

    expect(
      await run(setupLinkActions.revokeSetupLinkAction, { tokenId: target.id }),
    ).toMatchObject({ status: "ok", message: "admin.okLinkRevoked" })

    // Idempotent from the caller's side, and never an exception: `revoked_at`
    // is write-once, so a second revoke would raise if it were attempted.
    expect(
      await run(setupLinkActions.revokeSetupLinkAction, { tokenId: target.id }),
    ).toMatchObject({ status: "error", error: "admin.errorNothingToRevoke" })

    const after = (
      await listSetupLinks(await office(), {
        organizationId: org.organizationId,
      })
    ).find((entry) => entry.id === target.id)
    expect(after?.status).toBe("revoked")
  })

  it("refuses a token id that is not a uuid", async () => {
    as(staff.headers)
    expect(
      await run(setupLinkActions.revokeSetupLinkAction, { tokenId: "../../" }),
    ).toMatchObject({ status: "error", error: "admin.errorInvalidInput" })
  })

  it("refuses to mint an invite into an archived book", async () => {
    // An archived organization admits nobody, so the link's only possible
    // outcome is a 404 for whoever clicks it. Archiving already revokes what
    // was outstanding (0003); this is the other half — without it the office
    // can re-mint into a book it has just withdrawn.
    const book = await seedOrganization()
    as(staff.headers)
    await run(organizationActions.setOrganizationArchivedAction, {
      organizationId: book.organizationId,
      archived: "true",
    })

    expect(
      await run(membershipActions.inviteToOrganizationAction, {
        organizationId: book.organizationId,
        email: `${unique("arch")}@example.com`,
        role: "guest",
      }),
    ).toMatchObject({
      status: "error",
      error: "admin.errorOrganizationArchived",
    })

    // And it works again once the book is back.
    await run(organizationActions.setOrganizationArchivedAction, {
      organizationId: book.organizationId,
      archived: "false",
    })
    expect(
      await run(membershipActions.inviteToOrganizationAction, {
        organizationId: book.organizationId,
        email: `${unique("arch")}@example.com`,
        role: "guest",
      }),
    ).toMatchObject({ status: "issued" })
  })

  it("revokes the outstanding invites when a book is archived", async () => {
    const book = await seedOrganization()
    const email = `${unique("pending")}@example.com`
    as(staff.headers)
    await run(membershipActions.inviteToOrganizationAction, {
      organizationId: book.organizationId,
      email,
      role: "member",
    })

    const liveBefore = (
      await listSetupLinks(await office(), {
        organizationId: book.organizationId,
      })
    ).find((entry) => entry.email === email)
    expect(liveBefore?.status).toBe("live")

    await run(organizationActions.setOrganizationArchivedAction, {
      organizationId: book.organizationId,
      archived: "true",
    })

    const after = (
      await listSetupLinks(await office(), {
        organizationId: book.organizationId,
      })
    ).find((entry) => entry.email === email)
    expect(after?.status).toBe("revoked")
  })
})

// ---------------------------------------------------------------------------
// Offboarding — SF-6, through the actions
// ---------------------------------------------------------------------------

describe("SF-6 — offboarding through /admin revokes what is outstanding", () => {
  it("deactivating an account kills every live link addressed to it", async () => {
    const book = await seedOrganization()
    const leaver = await createAccount()
    await addMembership(book.organizationId, leaver.userId, "member")

    as(staff.headers)
    await run(membershipActions.inviteToOrganizationAction, {
      organizationId: book.organizationId,
      email: leaver.email,
      role: "guest",
    })
    await run(userActions.issueUserLinkAction, {
      email: leaver.email,
      activated: "true",
    })

    const live = (await listSetupLinks(await office())).filter(
      (entry) => entry.email === leaver.email,
    )
    expect(live).toHaveLength(2)
    expect(live.every((entry) => entry.status === "live")).toBe(true)

    expect(
      await run(userActions.setUserDisabledAction, {
        userId: leaver.userId,
        disabled: "true",
      }),
    ).toMatchObject({ status: "ok", message: "admin.okUserDisabled" })

    const after = (await listSetupLinks(await office())).filter(
      (entry) => entry.email === leaver.email,
    )
    expect(after.map((entry) => entry.status)).toEqual(["revoked", "revoked"])
  })

  it("deactivating an office account kills the links it ISSUED", async () => {
    // Containment: disabling a suspect office account has to kill the grants it
    // handed out, not just the ones addressed to it. Otherwise the office also
    // has to hunt its invites through the registry by hand, within 48 hours.
    const book = await seedOrganization()
    const rogue = await createAccount({ staff: true })
    as(staff.headers)
    await run(membershipActions.grantOwnerEverywhereAction, {
      userId: rogue.userId,
    })

    const invitee = `${unique("issued")}@example.com`
    as(rogue.headers)
    const issued = await run(membershipActions.inviteToOrganizationAction, {
      organizationId: book.organizationId,
      email: invitee,
      role: "admin",
    })
    expect(issued).toMatchObject({ status: "issued" })

    as(staff.headers)
    expect(
      await run(userActions.setUserDisabledAction, {
        userId: rogue.userId,
        disabled: "true",
      }),
    ).toMatchObject({ status: "ok" })

    const link = (await listSetupLinks(await office())).find(
      (entry) => entry.email === invitee,
    )
    expect(link?.status).toBe("revoked")
  })

  it("refuses to seat a deactivated office account as owner", async () => {
    // `is_staff` alone was not enough: a disabled owner does not count towards
    // `beta_active_owner_count`, so a book whose only owner is disabled reads
    // as ownerless and the last-owner guard stops defending it.
    const book = await seedOrganization()
    const retired = await createAccount({ staff: true })
    as(staff.headers)
    await run(userActions.setUserDisabledAction, {
      userId: retired.userId,
      disabled: "true",
    })

    await addMembership(book.organizationId, retired.userId, "guest")
    expect(
      await run(membershipActions.changeMemberRoleAction, {
        organizationId: book.organizationId,
        userId: retired.userId,
        role: "owner",
      }),
    ).toMatchObject({
      status: "error",
      error: "admin.errorOwnerRequiresActive",
    })

    // And "owner ve všech" refuses the same target, with the same distinction
    // between "not office staff" and "office account, but switched off".
    expect(
      await run(membershipActions.grantOwnerEverywhereAction, {
        userId: retired.userId,
      }),
    ).toMatchObject({
      status: "error",
      error: "admin.errorOwnerRequiresActive",
    })
  })

  it("deactivating a membership kills that book's invites and no others", async () => {
    const home = await seedOrganization()
    const elsewhere = await seedOrganization()
    const person = await createAccount()
    await addMembership(home.organizationId, person.userId, "member")
    await addMembership(elsewhere.organizationId, person.userId, "member")

    as(staff.headers)
    await run(membershipActions.inviteToOrganizationAction, {
      organizationId: home.organizationId,
      email: person.email,
      role: "guest",
    })
    await run(membershipActions.inviteToOrganizationAction, {
      organizationId: elsewhere.organizationId,
      email: person.email,
      role: "guest",
    })

    expect(
      await run(membershipActions.setMemberActiveAction, {
        organizationId: home.organizationId,
        userId: person.userId,
        active: "false",
      }),
    ).toMatchObject({
      status: "ok",
      message: "admin.okMemberDeactivated",
    })

    // Filtered per organization rather than grouped by name: the fixtures give
    // every seeded book the same `legal_name`, so a name-keyed map would
    // silently collapse the two rows this case is about.
    const statusIn = async (organizationId: string) =>
      (await listSetupLinks(await office(), { organizationId })).find(
        (entry) => entry.email === person.email,
      )?.status

    // One book's invite dies; the other book's is not its business.
    expect(await statusIn(home.organizationId)).toBe("revoked")
    expect(await statusIn(elsewhere.organizationId)).toBe("live")
  })
})

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

describe("office projections", () => {
  it("never ship a raw privileged column name to a client component", async () => {
    // The office tier legitimately RENDERS staff-ness and deactivation — as
    // `staff` and `disabled`, derived and deliberately named. A raw `is_staff`
    // or `disabled_at` key would mean a row arrived unpicked, which is the
    // thing being checked for. See the note in `lib/data/projections.ts`.
    as(staff.headers)
    const scope = await office()

    for (const [label, rows] of [
      ["organizations", await listOfficeOrganizations(scope)],
      ["members", await listOrganizationMembers(scope, org.organizationId)],
      ["users", await listOfficeUsers(scope)],
      ["links", await listSetupLinks(scope)],
    ] as const) {
      expect(rows.length, label).toBeGreaterThan(0)
      expect(forbiddenClientKeys(rows), label).toEqual([])
    }
  })

  it("reports the ownership invariant the office has to reason about", async () => {
    const empty = await seedOrganizationRow()
    as(staff.headers)
    const listed = (await listOfficeOrganizations(await office())).find(
      (row) => row.id === empty.organizationId,
    )
    // A book seeded straight into the table with no membership — the state
    // `createOfficeOrganization` refuses to produce. The grid shows it as the
    // zero it is rather than hiding it.
    expect(listed?.ownerCount).toBe(0)
    expect(listed?.memberCount).toBe(0)
  })
})
