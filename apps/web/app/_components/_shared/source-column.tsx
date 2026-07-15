"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"

/**
 * The shared "Zdroj" (source) column — the Tier-4 "Created by Agent" filter,
 * rendered identically on every domain list (Records, deník, …). A row is
 * "agent" when it carries provenance (`inbox_id IS NOT NULL`), else "human".
 * Each table supplies its own bucketing accessor (the underlying field differs:
 * `inbox_id` on documents, `createdByAgent` on the deník row).
 */
export function buildSourceColumn<T>(
  getBucket: (row: T) => "agent" | "human",
): ColumnDef<T> {
  return {
    id: "source",
    accessorFn: (row) => getBucket(row),
    header: "Zdroj",
    size: 110,
    cell: ({ row }) =>
      getBucket(row.original) === "agent" ? (
        <Badge variant="secondary">Agent</Badge>
      ) : (
        <span className="text-muted-foreground">Ruční</span>
      ),
    meta: {
      label: "Zdroj",
      variant: "multiSelect",
      options: [
        { label: "Agent", value: "agent" },
        { label: "Ruční", value: "human" },
      ],
    },
    enableColumnFilter: true,
    filterFn: (row, columnId, value) => {
      if (!Array.isArray(value) || value.length === 0) return true
      return value.includes(row.getValue(columnId))
    },
    enableSorting: true,
  }
}
