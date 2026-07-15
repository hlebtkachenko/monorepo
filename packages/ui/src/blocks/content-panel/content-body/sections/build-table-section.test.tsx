import { describe, it, expect } from "vitest"

import { buildTableSection, type TableColumnDef } from "./build-table-section"

interface Invoice {
  readonly id: string
  readonly customer: string
  readonly total: number
  readonly notes: string | null
}

const invoices: Invoice[] = [
  { id: "inv_1", customer: "Acme", total: 1000, notes: "net-30" },
  { id: "inv_2", customer: "Globex", total: 250, notes: null },
]

describe("buildTableSection", () => {
  it("passes column spec fields through verbatim (pin, width, enableFilter)", () => {
    const columns: TableColumnDef<Invoice>[] = [
      {
        id: "customer",
        header: "Customer",
        kind: "text",
        pin: "left",
        width: 220,
        enableFilter: true,
        accessor: (row) => row.customer,
      },
    ]

    const result = buildTableSection({
      columns,
      data: invoices,
      rowIdKey: "id",
      getRowId: (row) => row.id,
    })

    expect(result.columns).toEqual([
      {
        id: "customer",
        header: "Customer",
        kind: "text",
        pin: "left",
        width: 220,
        enableFilter: true,
      },
    ])
  })

  it("strips ONLY the accessor and forwards unknown/future spec fields untouched", () => {
    // Simulate a spec field added after this helper was written.
    type FutureColumnSpec = TableColumnDef<Invoice> & {
      readonly filterPreset?: string
    }
    const columns: FutureColumnSpec[] = [
      {
        id: "total",
        header: "Total",
        kind: "number",
        filterPreset: "positive-only",
        accessor: (row) => row.total,
      },
    ]

    const result = buildTableSection({
      columns,
      data: invoices,
      rowIdKey: "id",
      getRowId: (row) => row.id,
    })

    expect(result.columns).toEqual([
      {
        id: "total",
        header: "Total",
        kind: "number",
        filterPreset: "positive-only",
      },
    ])
    expect(result.columns[0]).not.toHaveProperty("accessor")
  })

  it("builds rows keyed by rowIdKey plus each column's accessor value, handling string/number/null", () => {
    const columns: TableColumnDef<Invoice>[] = [
      {
        id: "customer",
        header: "Customer",
        kind: "text",
        accessor: (row) => row.customer,
      },
      {
        id: "total",
        header: "Total",
        kind: "number",
        accessor: (row) => row.total,
      },
      {
        id: "notes",
        header: "Notes",
        kind: "text",
        accessor: (row) => row.notes,
      },
    ]

    const result = buildTableSection({
      columns,
      data: invoices,
      rowIdKey: "id",
      getRowId: (row) => row.id,
    })

    expect(result.rows).toEqual([
      { id: "inv_1", customer: "Acme", total: 1000, notes: "net-30" },
      { id: "inv_2", customer: "Globex", total: 250, notes: null },
    ])
  })

  it("stringifies getRowId output into rowIdKey", () => {
    interface NumericIdRecord {
      readonly recordId: number
      readonly label: string
    }
    const data: NumericIdRecord[] = [{ recordId: 42, label: "Answer" }]
    const columns: TableColumnDef<NumericIdRecord>[] = [
      {
        id: "label",
        header: "Label",
        kind: "text",
        accessor: (row) => row.label,
      },
    ]

    const result = buildTableSection({
      columns,
      data,
      rowIdKey: "rowId",
      getRowId: (row) => String(row.recordId),
    })

    expect(result.rows).toEqual([{ rowId: "42", label: "Answer" }])
    expect(typeof result.rows[0]!.rowId).toBe("string")
  })

  it("throws on duplicate column ids (dev guard)", () => {
    const columns: TableColumnDef<Invoice>[] = [
      {
        id: "customer",
        header: "Customer",
        kind: "text",
        accessor: (row) => row.customer,
      },
      {
        id: "customer",
        header: "Customer 2",
        kind: "text",
        accessor: (row) => row.customer,
      },
    ]

    expect(() =>
      buildTableSection({
        columns,
        data: invoices,
        rowIdKey: "id",
        getRowId: (row) => row.id,
      }),
    ).toThrow(/duplicate column id/)
  })

  it("throws on empty rowIdKey (dev guard)", () => {
    const columns: TableColumnDef<Invoice>[] = [
      {
        id: "customer",
        header: "Customer",
        kind: "text",
        accessor: (row) => row.customer,
      },
    ]

    expect(() =>
      buildTableSection({
        columns,
        data: invoices,
        rowIdKey: "",
        getRowId: (row) => row.id,
      }),
    ).toThrow(/rowIdKey/)
  })

  it("keeps the stable row id even when a column id collides with rowIdKey", () => {
    const columns: TableColumnDef<Invoice>[] = [
      {
        id: "id", // collides with rowIdKey
        header: "Id (bogus data column)",
        kind: "text",
        accessor: () => "not-the-real-id",
      },
    ]

    const result = buildTableSection({
      columns,
      data: invoices,
      rowIdKey: "id",
      getRowId: (row) => row.id,
    })

    expect(result.rows).toEqual([{ id: "inv_1" }, { id: "inv_2" }])
  })

  it("throws on duplicate generated row ids (dev guard)", () => {
    const columns: TableColumnDef<Invoice>[] = [
      {
        id: "customer",
        header: "Customer",
        kind: "text",
        accessor: (row) => row.customer,
      },
    ]

    expect(() =>
      buildTableSection({
        columns,
        data: invoices,
        rowIdKey: "id",
        getRowId: () => "same-id",
      }),
    ).toThrow(/duplicate generated row id/)
  })

  it("throws on a missing/empty generated row id (dev guard)", () => {
    const columns: TableColumnDef<Invoice>[] = [
      {
        id: "customer",
        header: "Customer",
        kind: "text",
        accessor: (row) => row.customer,
      },
    ]

    expect(() =>
      buildTableSection({
        columns,
        data: [invoices[0]!],
        rowIdKey: "id",
        getRowId: () => "",
      }),
    ).toThrow(/missing\/empty row id/)
  })
})
