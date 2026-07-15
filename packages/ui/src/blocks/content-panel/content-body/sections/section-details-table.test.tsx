import { render, screen, fireEvent, within } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { sectionDetailsTable } from "./section-details-table"
import { SectionDetailsTableRenderer } from "./section-details-table-renderer"
import type { SectionDetailsTablePayload } from "./section-details-table"
import { isSectionDescriptor } from "./section"
import { SectionActionProvider } from "./section-action-context"

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

  it("dispatches a confirmed read-only row action with the row id", () => {
    const onAction = vi.fn()
    wrap(
      <SectionActionProvider onAction={onAction}>
        <SectionDetailsTableRenderer
          props={base({
            mode: "readonly",
            rowAction: {
              label: "Revoke key",
              actionId: "api-key.revoke",
              variant: "destructive",
              confirmTitle: "Revoke this API key?",
              confirmDescription: "This cannot be undone.",
            },
          })}
        />
      </SectionActionProvider>,
    )

    const csRow = screen
      .getByText("Česká spořitelna")
      .closest('[role="row"]') as HTMLElement
    fireEvent.click(within(csRow).getByRole("button", { name: "Revoke key" }))
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Revoke key",
      }),
    )
    expect(onAction).toHaveBeenCalledWith({
      id: "api-key.revoke",
      payload: { rowId: "cs" },
    })
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

  it("toggles the Edit icon to an Apply action that returns the row to read mode", () => {
    wrap(<SectionDetailsTableRenderer props={base()} />)
    const csRow = screen
      .getByText("Česká spořitelna")
      .closest('[role="row"]') as HTMLElement
    fireEvent.click(within(csRow).getByRole("button", { name: "Edit row" }))
    // Editing: the same control now reads "Apply row changes".
    const iban = within(csRow).getByRole<HTMLInputElement>("textbox", {
      name: "IBAN",
    })
    fireEvent.change(iban, { target: { value: "CZ99 9999" } })
    fireEvent.click(
      within(csRow).getByRole("button", { name: "Apply row changes" }),
    )
    // Back to read mode, showing the applied value (no input, edit icon returns).
    expect(within(csRow).queryByRole("textbox")).toBeNull()
    expect(within(csRow).getByText("CZ99 9999")).toBeInTheDocument()
    expect(
      within(csRow).getByRole("button", { name: "Edit row" }),
    ).toBeInTheDocument()
    // Re-editing keeps the applied value — it is NOT re-seeded from the original.
    fireEvent.click(within(csRow).getByRole("button", { name: "Edit row" }))
    expect(
      within(csRow).getByRole<HTMLInputElement>("textbox", { name: "IBAN" }),
    ).toHaveValue("CZ99 9999")
  })

  it("a new row shows Apply while editing, then Edit + Remove after applying", () => {
    wrap(
      <SectionDetailsTableRenderer props={base({ addLabel: "Add account" })} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Add account" }))
    // Only the new row is editing → exactly one Apply control, and an X remove.
    expect(
      screen.getByRole("button", { name: "Apply row changes" }),
    ).toBeInTheDocument()
    // Enter a value so Apply keeps the row (an empty new row would be discarded).
    fireEvent.change(screen.getByRole("textbox", { name: "IBAN" }), {
      target: { value: "CZ00 0000" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Apply row changes" }))
    // Applied → the new row is read-only (Edit icon) but keeps its X remove.
    expect(
      screen.queryByRole("button", { name: "Apply row changes" }),
    ).toBeNull()
    expect(
      screen.getByRole("button", { name: "Remove new row" }),
    ).toBeInTheDocument()
  })
})

describe("SectionDetailsTableRenderer — editHint", () => {
  it("renders an underlined link to where the data is editable", () => {
    wrap(
      <SectionDetailsTableRenderer
        props={base({
          mode: "readonly",
          editHint: {
            text: "To edit these details, go to",
            linkLabel: "Company identity",
            href: "/acme/settings",
          },
        })}
      />,
    )
    expect(screen.getByText(/To edit these details, go to/)).toBeInTheDocument()
    const link = screen.getByRole("link", { name: /Company identity/ })
    expect(link).toHaveAttribute("href", "/acme/settings")
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

  it("Apply on a still-empty new row discards it (no blank row left behind)", () => {
    wrap(
      <SectionDetailsTableRenderer props={base({ addLabel: "Add account" })} />,
    )
    const rowsBefore = screen.getAllByRole("row").length
    fireEvent.click(screen.getByRole("button", { name: "Add account" }))
    expect(screen.getAllByRole("row").length).toBe(rowsBefore + 1)
    // Nothing entered → Apply behaves like discard; the row is dropped.
    fireEvent.click(screen.getByRole("button", { name: "Apply row changes" }))
    expect(screen.getAllByRole("row").length).toBe(rowsBefore)
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
