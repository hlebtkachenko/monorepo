/**
 * client_task through the seam (spec §3.4, §2.1).
 *
 * Extends the contract `scope.test.ts` / `documents-office.test.ts` establish:
 * every org-scoped read reaches through `requireScope`, every office write
 * reaches through `requireOwner`, and the sessions are genuine Better Auth
 * sessions (`next/headers` mocked, no real HTTP request in a test runner).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import postgres from "postgres"

import {
  createClientTaskRow,
  createClientTaskTemplateRow,
  createMonthPeriod,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"
import { sharedDatabaseUrl } from "../../tests/scratch-db"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope, requireOwner, resolveOrgScope } = await import("./scope")
const {
  openClientTasksForScope,
  listTasksForOwner,
  listTemplatesForOwner,
  createClientTask,
  updateClientTask,
  setClientTaskDone,
  deleteClientTask,
  createClientTaskTemplate,
  updateClientTaskTemplate,
  createMonthlyTaskSet,
} = await import("./client-tasks")
const { forbiddenClientKeys } = await import("./projections")

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

async function expectConstraintRefusal(
  run: () => Promise<unknown>,
  constraint: RegExp,
): Promise<void> {
  let messages = "<no throw>"
  try {
    await run()
  } catch (error) {
    const chain: string[] = []
    let current: unknown = error
    for (let depth = 0; current && depth < 5; depth++) {
      chain.push(String((current as { message?: unknown }).message ?? current))
      current = (current as { cause?: unknown }).cause
    }
    messages = chain.join("\n")
  }
  expect(messages).toMatch(constraint)
}

function as(headers: Headers): void {
  request.headers = headers
}

let sql: postgres.Sql

beforeAll(() => {
  sql = postgres(sharedDatabaseUrl(), { max: 6, onnotice: () => {} })
})

afterAll(async () => {
  await sql.end({ timeout: 5 })
  await endFixtures()
})

/** The office's own write handle — the only thing every write below accepts. */
async function ownerScopeFor(org: TestOrganization) {
  as(org.members.owner.headers)
  return requireOwner(await requireScope(org.slug))
}

// ---------------------------------------------------------------------------
// Client read — "Co od vás potřebujeme"
// ---------------------------------------------------------------------------

describe("openClientTasksForScope", () => {
  it("returns only this org's OPEN, non-template tasks, due-date ascending", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()

    const later = await createClientTaskRow(org.organizationId, {
      title: "Pozdější",
      dueDate: "2026-06-01",
    })
    const sooner = await createClientTaskRow(org.organizationId, {
      title: "Dřívější",
      dueDate: "2026-03-01",
    })
    await createClientTaskRow(org.organizationId, {
      title: "Hotovo",
      status: "done",
      doneAt: new Date(),
      dueDate: "2026-01-01",
    })
    await createClientTaskTemplateRow(org.organizationId)
    await createClientTaskRow(foreign.organizationId, { title: "Cizí" })

    as(org.members.member.headers)
    const rows = await openClientTasksForScope(await requireScope(org.slug))

    expect(rows.map((row) => row.id)).toEqual([sooner, later])
  })

  it("is readable by every role, guest included", async () => {
    const org = await seedOrganization()
    await createClientTaskRow(org.organizationId)

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const rows = await openClientTasksForScope(await requireScope(org.slug))
      expect(rows, `${role} reads the list`).toHaveLength(1)
    }
  })

  it("carries no forbidden column, in any spelling", async () => {
    const org = await seedOrganization()
    await createClientTaskRow(org.organizationId, {
      description: "Popis úkolu",
    })

    as(org.members.guest.headers)
    const rows = await openClientTasksForScope(await requireScope(org.slug))
    expect(forbiddenClientKeys(rows)).toEqual([])
  })

  it("cannot be pointed at another organization — the handle is the only input", async () => {
    const orgA = await seedOrganization()
    const orgB = await seedOrganization()
    await createClientTaskRow(orgB.organizationId)

    as(orgA.members.member.headers)
    await expect404(
      () => requireScope(orgB.slug),
      "A's member must not resolve B",
    )
  })
})

// ---------------------------------------------------------------------------
// Office reads — the two tabs
// ---------------------------------------------------------------------------

describe("listTasksForOwner / listTemplatesForOwner", () => {
  it("splits tasks and templates, and orders tasks open-first then by due date", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    const done = await createClientTaskRow(org.organizationId, {
      status: "done",
      doneAt: new Date(),
      dueDate: "2026-01-01",
    })
    const openLater = await createClientTaskRow(org.organizationId, {
      dueDate: "2026-06-01",
    })
    const openSooner = await createClientTaskRow(org.organizationId, {
      dueDate: "2026-03-01",
    })
    const template = await createClientTaskTemplateRow(org.organizationId)

    const tasks = await listTasksForOwner(owner)
    expect(tasks.map((t) => t.id)).toEqual([openSooner, openLater, done])

    const templates = await listTemplatesForOwner(owner)
    expect(templates.map((t) => t.id)).toEqual([template])
  })

  it("404s for every non-owner role — owner IS the accountant", async () => {
    const org = await seedOrganization()

    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const scope = await resolveOrgScope(org.slug)
      await expect404(
        () => requireOwner(scope!),
        `${role} must not get OwnerScope`,
      )
    }
  })

  it("carries no forbidden column, in any spelling", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createClientTaskRow(org.organizationId)
    await createClientTaskTemplateRow(org.organizationId)

    expect(forbiddenClientKeys(await listTasksForOwner(owner))).toEqual([])
    expect(forbiddenClientKeys(await listTemplatesForOwner(owner))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Task CRUD
// ---------------------------------------------------------------------------

describe("createClientTask / updateClientTask / deleteClientTask", () => {
  it("creates, edits and deletes a task", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    const created = await createClientTask(owner, {
      title: "Nahrát výpis",
      dueDate: "2026-04-10",
    })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error("unreachable")

    const edited = await updateClientTask(owner, created.id, {
      title: "Nahrát bankovní výpis",
      linkKind: "dokumenty",
    })
    expect(edited.ok).toBe(true)

    const [row] = await sql<{ title: string; link_kind: string }[]>`
      SELECT title, link_kind FROM client_task WHERE id = ${created.id}
    `
    expect(row).toEqual({
      title: "Nahrát bankovní výpis",
      link_kind: "dokumenty",
    })

    expect(await deleteClientTask(owner, created.id)).toBe(true)
    const gone = await sql`SELECT id FROM client_task WHERE id = ${created.id}`
    expect(gone).toHaveLength(0)
  })

  it("refuses an empty title", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    const result = await createClientTask(owner, {
      title: "   ",
      dueDate: "2026-04-10",
    })
    expect(result).toEqual({ ok: false, reason: "invalid_title" })
  })

  it("refuses a malformed due date", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    const result = await createClientTask(owner, {
      title: "Úkol",
      dueDate: "10.4.2026",
    })
    expect(result).toEqual({ ok: false, reason: "invalid_date" })
  })

  it("cannot update or delete another organization's task, id in hand", async () => {
    const orgA = await seedOrganization()
    const orgB = await seedOrganization()
    const ownerA = await ownerScopeFor(orgA)
    const taskB = await createClientTaskRow(orgB.organizationId)

    const edited = await updateClientTask(ownerA, taskB, { title: "Napadeno" })
    expect(edited).toEqual({ ok: false, reason: "not_found" })
    expect(await deleteClientTask(ownerA, taskB)).toBe(false)

    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM client_task WHERE id = ${taskB}
    `
    expect(row!.title).not.toBe("Napadeno")
  })

  it("non-owner roles never obtain the write handle at all", async () => {
    const org = await seedOrganization()

    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const scope = await resolveOrgScope(org.slug)
      await expect404(() => requireOwner(scope!), `${role} must not write`)
    }
  })
})

describe("setClientTaskDone", () => {
  it("marks a task done and reopens it, keeping status and done_at coherent", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const id = await createClientTaskRow(org.organizationId)

    expect(await setClientTaskDone(owner, id, true)).toBe(true)
    const [done] = await sql<{ status: string; done_at: Date | null }[]>`
      SELECT status, done_at FROM client_task WHERE id = ${id}
    `
    expect(done!.status).toBe("done")
    expect(done!.done_at).not.toBeNull()

    expect(await setClientTaskDone(owner, id, false)).toBe(true)
    const [reopened] = await sql<{ status: string; done_at: Date | null }[]>`
      SELECT status, done_at FROM client_task WHERE id = ${id}
    `
    expect(reopened!.status).toBe("open")
    expect(reopened!.done_at).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

describe("createClientTaskTemplate / updateClientTaskTemplate", () => {
  it("creates and edits a template", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    const created = await createClientTaskTemplate(owner, {
      title: "Docházka",
      templateDueDay: 10,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error("unreachable")

    const edited = await updateClientTaskTemplate(owner, created.id, {
      templateDueDay: 15,
    })
    expect(edited.ok).toBe(true)

    const [row] = await sql<{ template_due_day: number }[]>`
      SELECT template_due_day FROM client_task WHERE id = ${created.id}
    `
    expect(row!.template_due_day).toBe(15)
  })

  it("refuses a day-of-month outside 1-31", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    expect(
      await createClientTaskTemplate(owner, {
        title: "Docházka",
        templateDueDay: 32,
      }),
    ).toEqual({ ok: false, reason: "invalid_due_day" })

    expect(
      await createClientTaskTemplate(owner, {
        title: "Docházka",
        templateDueDay: 0,
      }),
    ).toEqual({ ok: false, reason: "invalid_due_day" })
  })
})

// ---------------------------------------------------------------------------
// "Vytvořit měsíční sadu úkolů" — idempotency
// ---------------------------------------------------------------------------

describe("createMonthlyTaskSet", () => {
  it("instantiates one task per active template, clamped to the month's real last day", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    await createClientTaskTemplateRow(org.organizationId, {
      title: "Docházka",
      templateDueDay: 5,
    })
    await createClientTaskTemplateRow(org.organizationId, {
      title: "Faktury",
      // 2026 is not a leap year — February has 28 days, so this must clamp.
      templateDueDay: 31,
    })

    const outcome = await createMonthlyTaskSet(owner, { year: 2026, month: 2 })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) throw new Error("unreachable")
    expect(outcome.result.created).toBe(2)
    expect(outcome.result.alreadyExisted).toBe(0)

    const rows = await sql<{ title: string; due_date: string }[]>`
      SELECT title, due_date::text FROM client_task
       WHERE organization_id = ${org.organizationId} AND is_template = false
       ORDER BY title
    `
    expect(rows).toEqual([
      { title: "Docházka", due_date: "2026-02-05" },
      { title: "Faktury", due_date: "2026-02-28" },
    ])
  })

  it("applying the same month twice creates nothing the second time", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createClientTaskTemplateRow(org.organizationId)
    await createClientTaskTemplateRow(org.organizationId, { title: "Druhá" })

    const first = await createMonthlyTaskSet(owner, { year: 2026, month: 5 })
    expect(first.ok && first.result.created).toBe(2)
    expect(first.ok && first.result.alreadyExisted).toBe(0)

    const second = await createMonthlyTaskSet(owner, { year: 2026, month: 5 })
    expect(second.ok && second.result.created).toBe(0)
    expect(second.ok && second.result.alreadyExisted).toBe(2)

    const [row] = await sql<{ total: string }[]>`
      SELECT count(*)::text AS total FROM client_task
       WHERE organization_id = ${org.organizationId} AND is_template = false
    `
    expect(row!.total).toBe("2")
  })

  it("a later month for the same templates creates fresh rows alongside the earlier month's", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await createClientTaskTemplateRow(org.organizationId)

    await createMonthlyTaskSet(owner, { year: 2026, month: 5 })
    const june = await createMonthlyTaskSet(owner, { year: 2026, month: 6 })
    expect(june.ok && june.result.created).toBe(1)

    const [row] = await sql<{ total: string }[]>`
      SELECT count(*)::text AS total FROM client_task
       WHERE organization_id = ${org.organizationId} AND is_template = false
    `
    expect(row!.total).toBe("2")
  })

  it("refuses an out-of-range month", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    expect(
      await createMonthlyTaskSet(owner, { year: 2026, month: 13 }),
    ).toEqual({ ok: false, reason: "invalid_period" })
  })

  it("with zero active templates, creates zero tasks without error", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    const outcome = await createMonthlyTaskSet(owner, { year: 2026, month: 7 })
    expect(outcome).toEqual({
      ok: true,
      result: { periodId: expect.any(String), created: 0, alreadyExisted: 0 },
    })
  })

  it("never touches another organization's templates", async () => {
    const orgA = await seedOrganization()
    const orgB = await seedOrganization()
    const ownerA = await ownerScopeFor(orgA)
    await createClientTaskTemplateRow(orgB.organizationId)

    const outcome = await createMonthlyTaskSet(ownerA, { year: 2026, month: 8 })
    expect(outcome.ok && outcome.result.created).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// DB CHECK constraints — the floor under the write layer
// ---------------------------------------------------------------------------

describe("client_task CHECK constraints", () => {
  it("refuses a template with a due_date", async () => {
    const org = await seedOrganization()
    await expectConstraintRefusal(
      () => sql`
        INSERT INTO client_task (organization_id, is_template, title, due_date)
        VALUES (${org.organizationId}, true, 'Šablona', '2026-01-01')
      `,
      /client_task_due_date_shape/,
    )
  })

  it("refuses a real task with no due_date", async () => {
    const org = await seedOrganization()
    await expectConstraintRefusal(
      () => sql`
        INSERT INTO client_task (organization_id, is_template, title)
        VALUES (${org.organizationId}, false, 'Úkol bez termínu')
      `,
      /client_task_due_date_shape/,
    )
  })

  it("refuses template_due_day on a real task", async () => {
    const org = await seedOrganization()
    await expectConstraintRefusal(
      () => sql`
        INSERT INTO client_task (
          organization_id, is_template, title, due_date, template_due_day
        )
        VALUES (${org.organizationId}, false, 'Úkol', '2026-01-01', 5)
      `,
      /client_task_template_due_day_scope/,
    )
  })

  it("refuses a done template", async () => {
    const org = await seedOrganization()
    await expectConstraintRefusal(
      () => sql`
        INSERT INTO client_task (
          organization_id, is_template, title, status, done_at
        )
        VALUES (${org.organizationId}, true, 'Šablona', 'done', now())
      `,
      /client_task_template_never_done|client_task_status_done_at_coherence/,
    )
  })

  it("refuses status/done_at incoherence", async () => {
    const org = await seedOrganization()
    await expectConstraintRefusal(
      () => sql`
        INSERT INTO client_task (
          organization_id, is_template, title, due_date, status, done_at
        )
        VALUES (${org.organizationId}, false, 'Úkol', '2026-01-01', 'done', NULL)
      `,
      /client_task_status_done_at_coherence/,
    )
  })

  it("refuses a source_template_id from another organization", async () => {
    const orgA = await seedOrganization()
    const orgB = await seedOrganization()
    const periodA = await createMonthPeriod(orgA.organizationId)
    const templateB = await createClientTaskTemplateRow(orgB.organizationId)

    await expectConstraintRefusal(
      () => sql`
        INSERT INTO client_task (
          organization_id, is_template, title, due_date,
          source_template_id, source_period_id
        )
        VALUES (
          ${orgA.organizationId}, false, 'Úkol', '2026-01-01',
          ${templateB}, ${periodA}
        )
      `,
      /client_task_source_template_fk/,
    )
  })
})
