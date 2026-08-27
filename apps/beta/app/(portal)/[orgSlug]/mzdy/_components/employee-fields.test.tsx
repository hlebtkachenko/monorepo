/**
 * `EmployeeFields` — Zaměstnanci's field set, consumed by both the create and
 * the per-row edit `EntrySheet` (manual-entry plan §3.3, W3). Rendered
 * directly with `react-dom/server`, mirroring
 * `finance/uvery/_components/loan-fields.test.tsx`: `t` is a plain
 * synchronous prop, so no `NextIntlClientProvider` is needed, and no `Sheet`
 * either — fields render, and test, the same whether their parent is a Sheet
 * or a plain card.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { PayrollEmployeeView } from "@/lib/data/projections"

import { EmployeeFields } from "./employee-fields"

const t = (key: string) => key

function employee(
  overrides: Partial<PayrollEmployeeView> = {},
): PayrollEmployeeView {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fa",
    fullName: "Jana Nováková",
    contractType: "hpp",
    startedOn: "2025-03-01",
    endedOn: null,
    active: true,
    hasPortalAccount: false,
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  }
}

describe("EmployeeFields — create (no employee)", () => {
  it("prefixes every id/htmlFor pair with idPrefix", () => {
    const html = renderToStaticMarkup(
      <EmployeeFields t={t} idPrefix="new-employee" />,
    )
    expect(html).toContain('id="new-employee-fullName"')
    expect(html).toContain('for="new-employee-fullName"')
  })

  it("carries no stored value — every input starts empty", () => {
    const html = renderToStaticMarkup(
      <EmployeeFields t={t} idPrefix="new-employee" />,
    )
    expect(html).not.toContain("Jana Nováková")
  })

  it("marks fullName and contractType required, defaults active to true", () => {
    const html = renderToStaticMarkup(
      <EmployeeFields t={t} idPrefix="new-employee" />,
    )
    const fullName = html.match(/id="new-employee-fullName"[^>]*\/>/)?.[0]
    expect(fullName).toContain("required")
    const activeSelect = html.match(
      /id="new-employee-active"[\s\S]*?<\/select>/,
    )?.[0]
    expect(activeSelect).toContain('value="true" selected=""')
  })

  it("has no field for external_ref or app_user_id", () => {
    const html = renderToStaticMarkup(
      <EmployeeFields t={t} idPrefix="new-employee" />,
    )
    expect(html).not.toContain('name="externalRef"')
    expect(html).not.toContain('name="appUserId"')
  })
})

describe("EmployeeFields — edit (an existing employee)", () => {
  it("pre-fills every stored value as defaultValue", () => {
    const html = renderToStaticMarkup(
      <EmployeeFields
        t={t}
        idPrefix={`employee-${employee().id}`}
        employee={employee()}
      />,
    )
    expect(html).toContain('value="Jana Nováková"')
    expect(html).toContain('value="2025-03-01"')
  })

  it("scopes id/htmlFor by the row's own idPrefix, not a shared one", () => {
    const id = employee().id
    const html = renderToStaticMarkup(
      <EmployeeFields
        t={t}
        idPrefix={`employee-${id}`}
        employee={employee()}
      />,
    )
    expect(html).toContain(`id="employee-${id}-fullName"`)
    expect(html).toContain(`for="employee-${id}-fullName"`)
  })

  it("states endedOn and active independently, both explicit", () => {
    const html = renderToStaticMarkup(
      <EmployeeFields
        t={t}
        idPrefix="employee-leaver"
        employee={employee({ endedOn: "2026-05-31", active: true })}
      />,
    )
    expect(html).toContain('value="2026-05-31"')
    const activeSelect = html.match(
      /id="employee-leaver-active"[\s\S]*?<\/select>/,
    )?.[0]
    expect(activeSelect).toContain('value="true" selected=""')
  })
})
