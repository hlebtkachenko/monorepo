"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import { sectionTable } from "@workspace/ui/blocks/content-panel"
import type {
  ContentToolbarProps,
  TableColumnSpec,
  TableSectionRow,
} from "@workspace/ui/blocks/content-panel"

import { orgHref } from "@/lib/org/href"

/**
 * DebugArchetypeTableView — the Debug module's "Archetype Table" reference page
 * in the NEW org tree, wired end to end against REAL data (the org's accounting
 * periods, fetched + projected server-side and passed in as ready `TableSectionRow`s
 * — no fixtures, per the tree's charter). It exists to prove the Table archetype
 * + Table Body compose cleanly here under the section-library governance: the body
 * is a single `sectionTable(...)`, whose kind (`"table"`) is the only thing
 * `ArchetypeTable.sections` accepts — the archetype-section policy makes any other
 * section a `tsc` error.
 *
 * A client boundary because `ArchetypeTable` is `"use client"` and its
 * `toolbar` / `sections` close over the live table instance (non-serializable),
 * so the page.tsx owns the fetch + projection and hands down plain rows.
 */

const COLUMNS: TableColumnSpec[] = [
  { id: "start", header: "Start", kind: "text", role: "id", width: 160 },
  { id: "end", header: "End", kind: "text", width: 160 },
  { id: "status", header: "Status", kind: "text", width: 140 },
]

export function DebugArchetypeTableView({
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
          anchor: "periods",
          columns: COLUMNS,
          rows,
          rowIdKey: "id",
          features: { search: true },
          emptyText: "This organization has no accounting periods yet.",
        }),
      ]}
    />
  )
}
