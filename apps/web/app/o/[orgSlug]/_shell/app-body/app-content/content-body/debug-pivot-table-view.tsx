"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import { sectionPivotTable } from "@workspace/ui/blocks/content-panel"
import type {
  ContentToolbarProps,
  TableSectionRow,
} from "@workspace/ui/blocks/content-panel"

import { orgHref } from "@/lib/org/href"

/**
 * DebugPivotTableView — the Debug → Archetype Table (Pivot Table) reference page
 * in the new org tree. Proves the Table archetype hosts the Pivot Table Body
 * (`sectionPivotTable`, the `pivot-table` section kind allowed by the policy),
 * from the packages/ui blocks — nothing hand-rolled.
 *
 * Rows come from `demo_debug_pivot_table_record` (dev-seeded, long-format
 * observations), projected once server-side. The section pivots them
 * category × month → Σ amount. Client boundary (same reason as the Normal view).
 */

export function DebugPivotTableView({
  slug,
  title,
  rows,
}: {
  slug: string
  title: string
  rows: readonly TableSectionRow[]
}) {
  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> => ({
      viewTools: table ? { table } : undefined,
    }),
    [],
  )

  return (
    <ArchetypeTable<TableSectionRow>
      title={title}
      breadcrumb={[
        { label: "Debug", href: orgHref(slug, "debug"), icon: "Bug" },
      ]}
      toolbar={buildToolbar}
      sections={[
        sectionPivotTable({
          anchor: "pivot",
          rows,
          rowDimensions: [{ field: "category", label: "Category" }],
          columnDimensions: [{ field: "month", label: "Month" }],
          measures: [
            {
              id: "total",
              label: "Total",
              agg: "sum",
              field: "amount",
              format: { style: "currency", currency: "CZK" },
            },
          ],
          rowLabelHeader: "Category",
          subtotalRows: true,
          emptyText: "No demo records — seed the dev org first.",
        }),
      ]}
    />
  )
}
