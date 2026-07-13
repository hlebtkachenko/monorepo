import { render, screen, fireEvent, within } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { sectionDetailsTable } from "./section-details-table"
import { SectionDetailsTableRenderer } from "./section-details-table-renderer"
import type { SectionDetailsTablePayload } from "./section-details-table"
import { isSectionDescriptor } from "./section"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

const COLUMNS = [
  {
    id: "iban",
    header: "IBAN",
    span: 2 as const,
    control: { kind: "text" as const },
  },
  {
    id: "bank",
    header: "Bank",
    span: 2 as const,
    control: { kind: "text" as const },
  },
  {
    id: "currency",
    header: "Currency",
    span: 1 as const,
    control: {
      kind: "select" as const,
      options: [
        { label: "CZK", value: "CZK" },
        { label: "EUR", value: "EUR" },
      ],
    },
  },
]

const ROWS = [
  {
    id: "cs",
    cells: { iban: "CZ65 0800", bank: "Česká spořitelna", currency: "CZK" },
  },
  {
    id: "fio",
    cells: { iban: "CZ12 2010", bank: "Fio banka", currency: "EUR" },
  },
]

const base = (
  over: Partial<SectionDetailsTablePayload> = {},
): SectionDetailsTablePayload => ({
  title: "Bank accounts",
  mode: "editable",
  columns: COLUMNS,
  rows: ROWS,
  actions: [],
  actionsHeader: "Actions",
  ...over,
})

describe("sectionDetailsTable factory", () => {
  it("mints a branded `details-table` descriptor with defaults", () => {
    const descriptor = sectionDetailsTable({
      title: "Bank accounts",
      columns: COLUMNS,
      rows: ROWS,
    })
    expect(descriptor.kind).toBe("details-table")
    expect(isSectionDescriptor(descriptor)).toBe(true)
    expect(descriptor.props.mode).toBe("editable")
    expect(descriptor.props.actions).toEqual([])
    expect(descriptor.props.actionsHeader).toBe("Actions")
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

describe("SectionDetailsTableRenderer — display", () => {
  it("renders headers as labels + rows as display text (select shows its label)", () => {
    wrap(<SectionDetailsTableRenderer props={base()} />)
    expect(
      screen.getByRole("columnheader", { name: "IBAN" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Česká spořitelna")).toBeInTheDocument()
    // A display row is not inputs; the select value shows as its option label.
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getAllByText("CZK").length).toBeGreaterThan(0)
  })

  it("readonly mode has no Edit/Delete column and no Add button", () => {
    wrap(<SectionDetailsTableRenderer props={base({ mode: "readonly" })} />)
    expect(screen.queryByRole("button", { name: "Edit row" })).toBeNull()
    expect(screen.queryByRole("columnheader", { name: "Actions" })).toBeNull()
  })
})

describe("SectionDetailsTableRenderer — edit a row", () => {
  it("flips a row to inputs seeded from its values on Edit", () => {
    wrap(<SectionDetailsTableRenderer props={base()} />)
    const csRow = screen
      .getByText("Česká spořitelna")
      .closest('[role="row"]') as HTMLElement
    fireEvent.click(within(csRow).getByRole("button", { name: "Edit row" }))
    // The IBAN cell is now a text input carrying the row's value.
    const iban = within(csRow).getByRole<HTMLInputElement>("textbox", {
      name: "IBAN",
    })
    expect(iban).toHaveValue("CZ65 0800")
    // Edited value persists (controlled) until save.
    fireEvent.change(iban, { target: { value: "CZ99 9999" } })
    expect(iban).toHaveValue("CZ99 9999")
  })
})

describe("SectionDetailsTableRenderer — add + remove new row", () => {
  it("appends a blank editable row and drops it on remove (no confirm)", () => {
    wrap(
      <SectionDetailsTableRenderer props={base({ addLabel: "Add account" })} />,
    )
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Add account" }))
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: "Remove new row" }))
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})

describe("SectionDetailsTableRenderer — delete confirmation", () => {
  it("opens a confirm dialog and removes the row only after confirming", () => {
    wrap(<SectionDetailsTableRenderer props={base()} />)
    const csRow = screen
      .getByText("Česká spořitelna")
      .closest('[role="row"]') as HTMLElement
    fireEvent.click(within(csRow).getByRole("button", { name: "Delete row" }))
    // Destructive confirmation appears; the row is still present.
    expect(
      screen.getByRole("alertdialog", { name: /Delete this row/ }),
    ).toBeInTheDocument()
    expect(screen.getByText("Česká spořitelna")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(screen.queryByText("Česká spořitelna")).toBeNull()
  })
})
