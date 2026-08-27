/**
 * `PayrollLineFields` — the field set both payroll line writes share
 * (manual-entry plan §3, W4). Rendered directly with `react-dom/server`,
 * mirroring `employee-fields.test.tsx`.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type {
  PayrollEmployeeLineView,
  PayrollEmployeeView,
} from "@/lib/data/projections"

import { PayrollLineFields } from "./payroll-line-fields"

const t = (key: string) => key

const EMPLOYEES: readonly PayrollEmployeeView[] = [
  {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fa",
    fullName: "Jana Nováková",
    contractType: "hpp",
    startedOn: "2025-03-01",
    endedOn: null,
    active: true,
    hasPortalAccount: false,
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
  {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fb",
    fullName: "Petr Nový",
    contractType: "dpp",
    startedOn: null,
    endedOn: null,
    active: true,
    hasPortalAccount: false,
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
]

function line(overrides: Partial<PayrollEmployeeLineView> = {}) {
  return {
    id: "0196a1a2-1111-7000-8000-000000000001",
    employeeId: EMPLOYEES[0]!.id,
    employeeName: EMPLOYEES[0]!.fullName,
    periodId: "0196a1a2-2222-7000-8000-000000000002",
    gross: "45000.00",
    deductionsTotal: "6750.00",
    net: "38250.00",
    employerCost: "60300.00",
    ...overrides,
  }
}

describe("PayrollLineFields — add (no line)", () => {
  it("prefixes every id/htmlFor pair with idPrefix", () => {
    const html = renderToStaticMarkup(
      <PayrollLineFields
        t={t}
        idPrefix="new-payroll-line"
        employees={EMPLOYEES}
      />,
    )
    expect(html).toContain('id="new-payroll-line-payrollEmployeeId"')
    expect(html).toContain('for="new-payroll-line-payrollEmployeeId"')
  })

  it("lists every employee by id, never a typed name", () => {
    const html = renderToStaticMarkup(
      <PayrollLineFields
        t={t}
        idPrefix="new-payroll-line"
        employees={EMPLOYEES}
      />,
    )
    for (const employee of EMPLOYEES) {
      expect(html).toContain(`value="${employee.id}"`)
      expect(html).toContain(employee.fullName)
    }
  })

  it("carries no stored value — every money input starts empty", () => {
    const html = renderToStaticMarkup(
      <PayrollLineFields
        t={t}
        idPrefix="new-payroll-line"
        employees={EMPLOYEES}
      />,
    )
    expect(html).not.toContain("45000.00")
  })
})

describe("PayrollLineFields — edit (an existing line)", () => {
  it("pre-fills every stored figure as defaultValue", () => {
    const html = renderToStaticMarkup(
      <PayrollLineFields
        t={t}
        idPrefix={`payroll-line-${line().id}`}
        employees={EMPLOYEES}
        line={line()}
      />,
    )
    expect(html).toContain('value="45000.00"')
    expect(html).toContain('value="38250.00"')
  })

  it("pre-selects the line's own employee, still editable to another", () => {
    const html = renderToStaticMarkup(
      <PayrollLineFields
        t={t}
        idPrefix={`payroll-line-${line().id}`}
        employees={EMPLOYEES}
        line={line()}
      />,
    )
    const select = html.match(
      /id="payroll-line-[^"]+-payrollEmployeeId"[\s\S]*?<\/select>/,
    )?.[0]
    expect(select).toContain(`value="${EMPLOYEES[0]!.id}" selected=""`)
    // The second employee is still a plain option — repointing is allowed.
    expect(select).toContain(`value="${EMPLOYEES[1]!.id}"`)
  })
})
