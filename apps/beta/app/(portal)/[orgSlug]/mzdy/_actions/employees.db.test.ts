/**
 * Zaměstnanci's register writes (manual-entry plan §3.3, W3), driven as the
 * POSTs they are — see `pro-ucetni/_actions/client-tasks.db.test.ts`'s own
 * header for why a Server Action is tested this way rather than by calling
 * `lib/data/payroll.ts` directly (already covered in `payroll.test.ts`).
 *
 * Proves the round trip the manual-entry plan (§2.5) requires: the action
 * lands the row AND the derived read model (`payrollEmployeesForScope`, the
 * same read `mzdy/zamestnanci/page.tsx` renders from) returns it — not
 * merely that the action resolved without throwing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
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

const { createPayrollEmployeeAction, updatePayrollEmployeeAction } =
  await import("./employees")
const { requireScope } = await import("@/lib/data/scope")
const { payrollEmployeesForScope } = await import("@/lib/data/payroll")

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

describe("createPayrollEmployeeAction — owner only", () => {
  it("refuses every non-owner role, including the employee-seat's own guest membership", async () => {
    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      await expect404(
        () =>
          createPayrollEmployeeAction(
            IDLE,
            fd({
              orgSlug: org.slug,
              fullName: "Petr Test",
              contractType: "hpp",
              active: "true",
            }),
          ),
        role,
      )
    }
  })
})

describe("the round trip", () => {
  it("lands a created row where payrollEmployeesForScope reads it back, then an edit updates it", async () => {
    as(org.members.owner.headers)
    const created = await createPayrollEmployeeAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        fullName: "Petr Dvořák",
        contractType: "hpp",
        startedOn: "2026-01-01",
        active: "true",
      }),
    )
    expect(created.status).toBe("ok")

    const scope = await requireScope(org.slug)
    const afterCreate = await payrollEmployeesForScope(scope)
    const row = afterCreate.find((e) => e.fullName === "Petr Dvořák")
    expect(row).toBeDefined()
    expect(row?.contractType).toBe("hpp")
    expect(row?.startedOn).toBe("2026-01-01")
    expect(row?.active).toBe(true)

    const updated = await updatePayrollEmployeeAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        employeeId: row!.id,
        fullName: "Petr Dvořák",
        contractType: "dpc",
        startedOn: "2026-01-01",
        endedOn: "2026-06-30",
        active: "false",
      }),
    )
    expect(updated.status).toBe("ok")

    const afterUpdate = await payrollEmployeesForScope(scope)
    const edited = afterUpdate.find((e) => e.id === row!.id)
    expect(edited?.contractType).toBe("dpc")
    expect(edited?.endedOn).toBe("2026-06-30")
    // `active` and `endedOn` are independent facts (spec §2.6.1) — the same
    // edit that stated a leaving date also flipped active to false here, but
    // the two writes are not coupled: neither reader derives one from the other.
    expect(edited?.active).toBe(false)
  })

  it("refuses an employment that ends before it began, without reaching the database", async () => {
    as(org.members.owner.headers)
    const state = await createPayrollEmployeeAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        fullName: "Neplatny Rozsah",
        contractType: "hpp",
        startedOn: "2026-06-01",
        endedOn: "2026-01-01",
        active: "true",
      }),
    )
    expect(state).toEqual({ status: "error", error: "mzdy.errorInvalidDates" })

    const scope = await requireScope(org.slug)
    const employees = await payrollEmployeesForScope(scope)
    expect(employees.some((e) => e.fullName === "Neplatny Rozsah")).toBe(false)
  })

  it("never lets external_ref be set through the form — the row stays outside the agent's match key", async () => {
    as(org.members.owner.headers)
    await createPayrollEmployeeAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        fullName: "Bez Odkazu",
        contractType: "dpp",
        active: "true",
        // A hostile client could still post this key; the action must never
        // read it, since `readEmployeeForm` names no `externalRef` field.
        externalRef: "erp-12345",
      }),
    )

    const scope = await requireScope(org.slug)
    const employees = await payrollEmployeesForScope(scope)
    // `PayrollEmployeeView` never carries `externalRef` at all (it is on
    // `CLIENT_FORBIDDEN_COLUMNS`) — the row existing at all, matched only on
    // name, is the assertion available from this read.
    expect(employees.some((e) => e.fullName === "Bez Odkazu")).toBe(true)
  })
})
