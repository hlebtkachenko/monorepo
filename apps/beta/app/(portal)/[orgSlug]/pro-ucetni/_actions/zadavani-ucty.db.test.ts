/**
 * The account map's three Server Actions, driven as the POSTs they are.
 *
 * A SERVER ACTION IS A PUBLIC ENDPOINT. It has a generated name, it is
 * reachable without ever rendering the page that holds its form, and it does
 * NOT run `pro-ucetni/layout.tsx`'s owner gate — so the matrix below is not a
 * repeat of `lib/data/account-balances.test.ts`'s. That one proves the DATA
 * layer refuses a non-owner handle; this one proves these actions never obtain
 * one, for every role, on every action, with a real `FormData` and a real
 * session.
 *
 * Its own file rather than three more rows in `zadavani.db.test.ts`: the
 * account map's refusals are its own (an overlap, a duplicate account) and its
 * happy path asserts against a table the other suite never touches.
 *
 * `revalidatePath` is mocked away — it is Next's request-scoped cache API and
 * throws outside a render; nothing about it is under test here.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createAccountMappingRow,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "@/tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}))

const actions = await import("./zadavani")
const { accountMappingsForScope } = await import("@/lib/data/account-balances")
const { requireScope } = await import("@/lib/data/scope")

const IDLE = { status: "idle" } as const
const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
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

/** Every action, with a payload that WOULD succeed for an owner. */
function everyAction(context: { orgSlug: string; mappingId: string }) {
  const { orgSlug, mappingId } = context
  return [
    [
      "createAccountMapping",
      actions.createAccountMappingAction,
      fd({
        orgSlug,
        accountCode: "263",
        matchKind: "exact",
        label: "Peníze na cestě",
        kind: "bank",
        sortOrder: "0",
        active: "true",
      }),
    ],
    [
      "saveAccountMapping",
      actions.saveAccountMappingAction,
      fd({
        orgSlug,
        mappingId,
        matchKind: "exact",
        label: "Prepsano",
        kind: "cash",
        sortOrder: "9",
        active: "false",
      }),
    ],
    [
      "deleteAccountMapping",
      actions.deleteAccountMappingAction,
      fd({ orgSlug, mappingId }),
    ],
  ] as const
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(endFixtures)

describe("the authz matrix — every action, every role", () => {
  it("404s admin, member and guest on all three actions", async () => {
    const target = await seedOrganization()
    const mappingId = await createAccountMappingRow(target.organizationId, {
      accountCode: "221",
      label: "Bezny ucet",
    })

    for (const role of ["admin", "member", "guest"] as const) {
      as(target.members[role].headers)
      for (const [name, action, payload] of everyAction({
        orgSlug: target.slug,
        mappingId,
      })) {
        await expect404(() => action(IDLE, payload), `${role} may not ${name}`)
      }
    }

    // Nothing above changed a single row.
    as(target.members.owner.headers)
    const scope = await requireScope(target.slug)
    const rows = await accountMappingsForScope(scope, { includeInactive: true })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: "Bezny ucet", active: true })
  })

  it("404s a signed-out visitor", async () => {
    as(new Headers())
    await expect404(
      () =>
        actions.createAccountMappingAction(
          IDLE,
          fd({
            orgSlug: org.slug,
            accountCode: "221",
            matchKind: "exact",
            label: "Anonym",
            kind: "bank",
            sortOrder: "0",
            active: "true",
          }),
        ),
      "no session, no write",
    )
  })

  it("404s an owner of ANOTHER organization — the slug is not authority", async () => {
    const foreign = await seedOrganization()
    const mappingId = await createAccountMappingRow(foreign.organizationId, {
      accountCode: "221",
    })

    as(org.members.owner.headers)
    for (const [name, action, payload] of everyAction({
      orgSlug: foreign.slug,
      mappingId,
    })) {
      await expect404(
        () => action(IDLE, payload),
        `an outside owner may not ${name}`,
      )
    }

    as(foreign.members.owner.headers)
    const scope = await requireScope(foreign.slug)
    expect(await accountMappingsForScope(scope)).toHaveLength(1)
  })

  it("404s a malformed or unknown slug rather than raising", async () => {
    as(org.members.owner.headers)
    for (const slug of ["", "NOT A SLUG", "../admin", "neexistuje"]) {
      await expect404(
        () =>
          actions.deleteAccountMappingAction(
            IDLE,
            fd({
              orgSlug: slug,
              mappingId: "00000000-0000-0000-0000-000000000000",
            }),
          ),
        `slug ${JSON.stringify(slug)}`,
      )
    }
  })
})

describe("account map writes — the owner's happy path and its refusals", () => {
  it("creates, edits, retires and deletes", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const base = {
      orgSlug: target.slug,
      accountCode: "221.01",
      matchKind: "exact",
      label: "Fio bezny ucet",
      kind: "bank",
      sortOrder: "0",
      active: "true",
    }

    expect(await actions.createAccountMappingAction(IDLE, fd(base))).toEqual({
      status: "ok",
      message: "zadavani.okCreated",
    })

    const scope = await requireScope(target.slug)
    const [created] = await accountMappingsForScope(scope)
    expect(created).toMatchObject({
      accountCode: "221.01",
      matchKind: "exact",
      kind: "bank",
      active: true,
    })

    expect(
      await actions.saveAccountMappingAction(
        IDLE,
        fd({
          orgSlug: target.slug,
          mappingId: created!.id,
          matchKind: "prefix",
          label: "Fio vcetne analytik",
          kind: "bank",
          sortOrder: "4",
          active: "false",
        }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okSaved" })

    // Retired: gone from every client read, still here for the office.
    expect(await accountMappingsForScope(scope)).toEqual([])
    const [retired] = await accountMappingsForScope(scope, {
      includeInactive: true,
    })
    expect(retired).toMatchObject({
      matchKind: "prefix",
      label: "Fio vcetne analytik",
      sortOrder: 4,
      active: false,
    })

    expect(
      await actions.deleteAccountMappingAction(
        IDLE,
        fd({ orgSlug: target.slug, mappingId: created!.id }),
      ),
    ).toEqual({ status: "ok", message: "zadavani.okDeleted" })
    expect(
      await accountMappingsForScope(scope, { includeInactive: true }),
    ).toEqual([])
  })

  it("refuses a duplicate account and an overlap with a Czech sentence", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const base = {
      orgSlug: target.slug,
      matchKind: "exact",
      kind: "bank",
      sortOrder: "0",
      active: "true",
    }

    await actions.createAccountMappingAction(
      IDLE,
      fd({ ...base, accountCode: "221.01", label: "Fio" }),
    )

    // The same účet twice — the unique index, which is NOT a check violation
    // and would otherwise escape as a 500.
    expect(
      await actions.createAccountMappingAction(
        IDLE,
        fd({ ...base, accountCode: "221.01", label: "Znovu" }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorAccountOverlap" })

    // A prefix that swallows it — the overlap trigger, which is.
    expect(
      await actions.createAccountMappingAction(
        IDLE,
        fd({
          ...base,
          accountCode: "221",
          matchKind: "prefix",
          label: "Vsechny banky",
        }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorAccountOverlap" })

    const scope = await requireScope(target.slug)
    expect(await accountMappingsForScope(scope)).toHaveLength(1)
  })

  it("refuses a malformed account code and a blank label", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const base = {
      orgSlug: target.slug,
      matchKind: "exact",
      kind: "bank",
      sortOrder: "0",
      active: "true",
    }

    expect(
      await actions.createAccountMappingAction(
        IDLE,
        fd({ ...base, accountCode: "   ", label: "Banka" }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorAccountCodeInvalid" })

    expect(
      await actions.createAccountMappingAction(
        IDLE,
        fd({ ...base, accountCode: "2".repeat(21), label: "Banka" }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorAccountCodeInvalid" })

    expect(
      await actions.createAccountMappingAction(
        IDLE,
        fd({ ...base, accountCode: "221", label: "  " }),
      ),
    ).toEqual({
      status: "error",
      error: "zadavani.errorAccountLabelRequired",
    })

    const scope = await requireScope(target.slug)
    expect(await accountMappingsForScope(scope)).toEqual([])
  })

  it("refuses an unrecognised kind, match kind or active value rather than casting", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    const base = {
      orgSlug: target.slug,
      accountCode: "221",
      matchKind: "exact",
      label: "Banka",
      kind: "bank",
      sortOrder: "0",
      active: "true",
    }

    // A `<select>` is a suggestion to a browser, not a constraint on a POST.
    for (const bad of [
      { kind: "crypto" },
      { matchKind: "regex" },
      { active: "" },
      { active: "yes" },
      { sortOrder: "-1" },
      { sortOrder: "1000" },
    ]) {
      expect(
        await actions.createAccountMappingAction(IDLE, fd({ ...base, ...bad })),
        JSON.stringify(bad),
      ).toEqual({ status: "error", error: "zadavani.errorInvalidInput" })
    }

    const scope = await requireScope(target.slug)
    expect(await accountMappingsForScope(scope)).toEqual([])
  })

  it("reports a save of a row that is not there", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    expect(
      await actions.saveAccountMappingAction(
        IDLE,
        fd({
          orgSlug: target.slug,
          mappingId: "00000000-0000-0000-0000-000000000000",
          matchKind: "exact",
          label: "Nikde",
          kind: "bank",
          sortOrder: "0",
          active: "true",
        }),
      ),
    ).toEqual({ status: "error", error: "zadavani.errorNotFound" })
  })
})
