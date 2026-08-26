/**
 * Úkoly klientovi's Server Actions, driven as the POSTs they are.
 *
 * A SERVER ACTION IS A PUBLIC ENDPOINT — see `zadavani.db.test.ts`'s own
 * header for the full reasoning. The matrix below proves the ACTIONS never
 * obtain an `OwnerScope` for a non-owner, on every action, with a real
 * `FormData` and a real session; `lib/data/client-tasks.test.ts` already
 * proves the DATA layer's own refusal.
 *
 * `revalidatePath` is mocked away — it is Next's request-scoped cache API and
 * throws outside a render.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createClientTaskRow,
  createClientTaskTemplateRow,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}))

const actions = await import("./client-tasks")
const { requireOwner, requireScope } = await import("@/lib/data/scope")
const { listTasksForOwner, listTemplatesForOwner } =
  await import("@/lib/data/client-tasks")

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

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

/**
 * Every action, with a payload that WOULD succeed for an owner — so a refusal
 * below is provably about the caller and never about the fields.
 */
function everyAction(context: {
  orgSlug: string
  taskId: string
  templateId: string
}) {
  const { orgSlug, taskId, templateId } = context
  return [
    [
      "createClientTask",
      actions.createClientTaskAction,
      fd({ orgSlug, title: "Novy ukol", dueDate: "2027-01-31" }),
    ],
    [
      "saveClientTask",
      actions.saveClientTaskAction,
      fd({ orgSlug, taskId, title: "Zmena", dueDate: "2027-02-28" }),
    ],
    [
      "setClientTaskDone",
      actions.setClientTaskDoneAction,
      fd({ orgSlug, taskId, done: "true" }),
    ],
    [
      "deleteClientTask",
      actions.deleteClientTaskAction,
      fd({ orgSlug, taskId }),
    ],
    [
      "createClientTaskTemplate",
      actions.createClientTaskTemplateAction,
      fd({ orgSlug, title: "Nova sablona", templateDueDay: "5" }),
    ],
    [
      "saveClientTaskTemplate",
      actions.saveClientTaskTemplateAction,
      fd({ orgSlug, templateId, title: "Zmena", templateDueDay: "10" }),
    ],
    [
      "deleteClientTaskTemplate",
      actions.deleteClientTaskTemplateAction,
      fd({ orgSlug, templateId }),
    ],
    [
      "createMonthlySet",
      actions.createMonthlySetAction,
      fd({ orgSlug, year: "2027", month: "3" }),
    ],
  ] as const
}

describe("the authz matrix — every action, every role", () => {
  it("404s admin, member and guest on all eight actions", async () => {
    const target = await seedOrganization()
    const taskId = await createClientTaskRow(target.organizationId)
    const templateId = await createClientTaskTemplateRow(target.organizationId)

    for (const role of ["admin", "member", "guest"] as const) {
      as(target.members[role].headers)
      for (const [name, action, payload] of everyAction({
        orgSlug: target.slug,
        taskId,
        templateId,
      })) {
        await expect404(() => action(IDLE, payload), `${role} may not ${name}`)
      }
    }

    // Nothing above changed a single row.
    as(target.members.owner.headers)
    const owner = requireOwner(await requireScope(target.slug))
    expect(await listTasksForOwner(owner)).toHaveLength(1)
    expect(await listTemplatesForOwner(owner)).toHaveLength(1)
  })

  it("404s a signed-out visitor", async () => {
    as(new Headers())
    await expect404(
      () =>
        actions.createClientTaskAction(
          IDLE,
          fd({ orgSlug: org.slug, title: "Anonym", dueDate: "2027-01-31" }),
        ),
      "no session, no write",
    )
  })

  it("404s an owner of ANOTHER organization — the slug is not authority", async () => {
    const foreign = await seedOrganization()
    const taskId = await createClientTaskRow(foreign.organizationId)
    const templateId = await createClientTaskTemplateRow(foreign.organizationId)

    as(org.members.owner.headers)
    for (const [name, action, payload] of everyAction({
      orgSlug: foreign.slug,
      taskId,
      templateId,
    })) {
      await expect404(
        () => action(IDLE, payload),
        `an outside owner may not ${name}`,
      )
    }

    as(foreign.members.owner.headers)
    const owner = requireOwner(await requireScope(foreign.slug))
    expect(await listTasksForOwner(owner)).toHaveLength(1)
    expect(await listTemplatesForOwner(owner)).toHaveLength(1)
  })

  it("404s a malformed or unknown slug rather than raising", async () => {
    as(org.members.owner.headers)
    for (const slug of ["", "NOT A SLUG", "../admin", "neexistuje"]) {
      await expect404(
        () =>
          actions.createClientTaskAction(
            IDLE,
            fd({ orgSlug: slug, title: "X", dueDate: "2027-01-31" }),
          ),
        `slug ${JSON.stringify(slug)}`,
      )
    }
  })
})

describe("task writes — the owner's happy path and its refusals", () => {
  it("creates, edits, marks done, reopens and deletes", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    const created = await actions.createClientTaskAction(
      IDLE,
      fd({
        orgSlug: target.slug,
        title: "Nahrat vypis",
        dueDate: "2027-04-10",
        linkKind: "dokumenty",
      }),
    )
    expect(created).toEqual({ status: "ok", message: "ukoly.okCreated" })

    const owner = requireOwner(await requireScope(target.slug))
    const [task] = await listTasksForOwner(owner)
    expect(task?.title).toBe("Nahrat vypis")

    const saved = await actions.saveClientTaskAction(
      IDLE,
      fd({
        orgSlug: target.slug,
        taskId: task!.id,
        title: "Nahrat bankovni vypis",
        dueDate: "2027-04-11",
      }),
    )
    expect(saved).toEqual({ status: "ok", message: "ukoly.okSaved" })

    const done = await actions.setClientTaskDoneAction(
      IDLE,
      fd({ orgSlug: target.slug, taskId: task!.id, done: "true" }),
    )
    expect(done).toEqual({ status: "ok", message: "ukoly.okMarkedDone" })

    const reopened = await actions.setClientTaskDoneAction(
      IDLE,
      fd({ orgSlug: target.slug, taskId: task!.id, done: "false" }),
    )
    expect(reopened).toEqual({ status: "ok", message: "ukoly.okMarkedOpen" })

    const deleted = await actions.deleteClientTaskAction(
      IDLE,
      fd({ orgSlug: target.slug, taskId: task!.id }),
    )
    expect(deleted).toEqual({ status: "ok", message: "ukoly.okDeleted" })
    expect(await listTasksForOwner(owner)).toEqual([])
  })

  it("refuses an empty title and a malformed date", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    expect(
      await actions.createClientTaskAction(
        IDLE,
        fd({ orgSlug: target.slug, title: "", dueDate: "2027-01-31" }),
      ),
    ).toEqual({ status: "error", error: "ukoly.errorInvalidInput" })

    expect(
      await actions.createClientTaskAction(
        IDLE,
        fd({ orgSlug: target.slug, title: "X", dueDate: "" }),
      ),
    ).toEqual({ status: "error", error: "ukoly.errorInvalidInput" })
  })

  it("deleting an unknown id is a refusal, not a silent no-op", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    const result = await actions.deleteClientTaskAction(
      IDLE,
      fd({
        orgSlug: target.slug,
        taskId: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6",
      }),
    )
    expect(result).toEqual({ status: "error", error: "ukoly.errorNotFound" })
  })
})

describe("template writes and the monthly-set button", () => {
  it("creates, edits and deletes a template", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    const created = await actions.createClientTaskTemplateAction(
      IDLE,
      fd({ orgSlug: target.slug, title: "Dochazka", templateDueDay: "5" }),
    )
    expect(created).toEqual({ status: "ok", message: "ukoly.okCreated" })

    const owner = requireOwner(await requireScope(target.slug))
    const [tmpl] = await listTemplatesForOwner(owner)

    const saved = await actions.saveClientTaskTemplateAction(
      IDLE,
      fd({
        orgSlug: target.slug,
        templateId: tmpl!.id,
        title: "Dochazka",
        templateDueDay: "15",
      }),
    )
    expect(saved).toEqual({ status: "ok", message: "ukoly.okSaved" })

    const deleted = await actions.deleteClientTaskTemplateAction(
      IDLE,
      fd({ orgSlug: target.slug, templateId: tmpl!.id }),
    )
    expect(deleted).toEqual({ status: "ok", message: "ukoly.okDeleted" })
    expect(await listTemplatesForOwner(owner)).toEqual([])
  })

  it("createMonthlySet is idempotent through the action layer too", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)
    await createClientTaskTemplateRow(target.organizationId)

    const first = await actions.createMonthlySetAction(
      { status: "idle" },
      fd({ orgSlug: target.slug, year: "2027", month: "5" }),
    )
    expect(first).toEqual({ status: "ok", created: 1, alreadyExisted: 0 })

    const second = await actions.createMonthlySetAction(
      { status: "idle" },
      fd({ orgSlug: target.slug, year: "2027", month: "5" }),
    )
    expect(second).toEqual({ status: "ok", created: 0, alreadyExisted: 1 })
  })

  it("refuses an out-of-range month", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    const result = await actions.createMonthlySetAction(
      { status: "idle" },
      fd({ orgSlug: target.slug, year: "2027", month: "13" }),
    )
    expect(result).toEqual({
      status: "error",
      error: "ukoly.errorInvalidPeriod",
    })
  })
})
