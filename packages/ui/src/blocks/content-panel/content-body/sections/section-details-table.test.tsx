import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { sectionDetailsTable } from "./section-details-table"
import { SectionDetailsTableRenderer } from "./section-details-table-renderer"
import { isSectionDescriptor } from "./section"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

const COLUMNS = [
  { id: "iban", header: "IBAN", display: { kind: "mono" as const } },
  { id: "bank", header: "Bank" },
  {
    id: "currency",
    header: "Currency",
    display: { kind: "badge" as const, tone: "neutral" as const },
  },
  {
    id: "primary",
    header: "Primary",
    align: "end" as const,
    display: { kind: "badge-or-dash" as const, tone: "success" as const },
  },
]

const ROWS = [
  {
    id: "cs",
    cells: {
      iban: "CZ65 0800 0000 1920 0014 5399",
      bank: "Česká spořitelna",
      currency: "CZK",
      primary: "Primary",
    },
  },
  {
    id: "fio",
    cells: {
      iban: "CZ12 2010 0000 0029 0148 1234",
      bank: "Fio banka",
      currency: "EUR",
      primary: "",
    },
  },
]

describe("sectionDetailsTable factory", () => {
  it("mints a branded `details-table` descriptor with defaults", () => {
    const descriptor = sectionDetailsTable({
      title: "Bank accounts",
      columns: COLUMNS,
      rows: ROWS,
    })
    expect(descriptor.kind).toBe("details-table")
    expect(isSectionDescriptor(descriptor)).toBe(true)
    // Defaults: readonly mode, empty actions list.
    expect(descriptor.props.mode).toBe("readonly")
    expect(descriptor.props.actions).toEqual([])
  })

  it("defaults the harvest `name` to the anchor", () => {
    const descriptor = sectionDetailsTable({
      title: "Bank accounts",
      anchor: "bank-accounts",
      columns: COLUMNS,
      rows: ROWS,
    })
    expect(descriptor.props.name).toBe("bank-accounts")
  })
})

describe("SectionDetailsTableRenderer — readonly", () => {
  it("renders headers, display cells, a badge, and an em dash for an empty flag", () => {
    wrap(
      <SectionDetailsTableRenderer
        props={{
          title: "Bank accounts",
          mode: "readonly",
          columns: COLUMNS,
          rows: ROWS,
          actions: [],
        }}
      />,
    )
    expect(
      screen.getByRole("columnheader", { name: "IBAN" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Česká spořitelna")).toBeInTheDocument()
    // The primary flag is a badge on row 1, an em dash on row 2. ("Primary" also
    // appears as the column header, so scope the assertion to the badge.)
    expect(
      screen.getByText("Primary", { selector: '[data-slot="badge"]' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText("—")).toHaveLength(1)
    // Readonly cells are not inputs.
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})

describe("SectionDetailsTableRenderer — add-row behaviour", () => {
  it("appends a blank editable row (with a remove control) on the add action", () => {
    wrap(
      <SectionDetailsTableRenderer
        props={{
          title: "Bank accounts",
          mode: "readonly",
          columns: COLUMNS,
          rows: ROWS,
          actions: [{ id: "new", label: "New", icon: "add" }],
        }}
      />,
    )
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "New" }))
    // A new editable row appears (its cells are inputs) with a remove button.
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0)
    const remove = screen.getByRole("button", { name: "Remove new row" })
    expect(remove).toBeInTheDocument()
    fireEvent.click(remove)
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})

describe("SectionDetailsTableRenderer — editable", () => {
  it("renders existing rows as inputs seeded from their values", () => {
    wrap(
      <SectionDetailsTableRenderer
        props={{
          title: "Contacts",
          mode: "editable",
          columns: [{ id: "name", header: "Name" }],
          rows: [{ id: "r1", cells: { name: "Jan Novák" } }],
          actions: [],
        }}
      />,
    )
    // No add action → no trailing column → the row's single cell is one input,
    // labelled by its column header and seeded from the cell value.
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Name",
    })
    expect(input).toHaveValue("Jan Novák")
  })
})
