"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import {
  SectionList,
  sectionInspectorKeyDetails,
  sectionTable,
} from "@workspace/ui/blocks/content-panel"
import type {
  ContentToolbarProps,
  TableColumnSpec,
  TableSectionRow,
} from "@workspace/ui/blocks/content-panel"

import { orgHref } from "@/lib/org/href"

/**
 * DebugNormalTableView — the Debug → Archetype Table (Normal Table) reference
 * page in the new org tree. Proves the Table archetype + the Normal Table Body
 * (`sectionTable`) + the row Inspector compose cleanly here, all from the
 * packages/ui blocks (nothing hand-rolled) and under the section-library
 * governance (the body is a single `table` section, the only kind
 * `ArchetypeTable.sections` accepts).
 *
 * Rows come from the `demo_debug_normal_table_record` table (dev-seeded, never
 * real product data), projected once server-side and passed in as plain
 * `TableSectionRow`s. Client boundary: `ArchetypeTable` is `"use client"` and its
 * toolbar/sections/inspector callbacks are non-serializable.
 */

const COLUMNS: TableColumnSpec[] = [
  { id: "document", header: "Document", kind: "text", role: "id", width: 150 },
  { id: "partner", header: "Partner", kind: "text", width: 180 },
  { id: "status", header: "Status", kind: "text", width: 130 },
  { id: "amount", header: "Amount", kind: "number", align: "end", width: 140 },
  { id: "issuedOn", header: "Issued", kind: "text", width: 140 },
]

export function DebugNormalTableView({
  slug,
  title,
  rows,
}: {
  slug: string
  title: string
  rows: readonly TableSectionRow[]
}) {
  const [search, setSearch] = React.useState("")

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> => ({
      search: {
        value: search,
        onChange: (value) => {
          setSearch(value)
          table?.setGlobalFilter(value)
        },
      },
      viewTools: table ? { table } : undefined,
    }),
    [search],
  )

  return (
    <ArchetypeTable<TableSectionRow>
      title={title}
      breadcrumb={[
        { label: "Debug", href: orgHref(slug, "debug"), icon: "Bug" },
      ]}
      toolbar={buildToolbar}
      sections={[
        sectionTable({
          anchor: "records",
          columns: COLUMNS,
          rows,
          rowIdKey: "id",
          // `inspect` adds the per-row open-Inspector affordance; it needs the
          // `role: "id"` column above to host the button.
          features: { search: true, inspect: true },
          emptyText: "No demo records — seed the dev org first.",
        }),
      ]}
      inspectorRowTitle={(row) => `#${String(row.document ?? "")}`}
      inspectorRowName={(row) => String(row.partner ?? "")}
      inspectorRowContent={(row) => ({
        details: (
          <SectionList
            sections={[
              sectionInspectorKeyDetails({
                lines: [
                  { label: "Document", value: String(row.document ?? "") },
                  { label: "Partner", value: String(row.partner ?? "") },
                  { label: "Status", value: String(row.status ?? "") },
                  {
                    label: "Amount",
                    value: Number(row.amount ?? 0),
                    type: "money",
                    currency: "CZK",
                  },
                  {
                    label: "Issued",
                    value: String(row.issuedOn ?? ""),
                    type: "date",
                  },
                  { label: "Note", value: String(row.note ?? "") },
                ],
              }),
            ]}
          />
        ),
      })}
    />
  )
}
