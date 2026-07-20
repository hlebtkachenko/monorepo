import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { SectionTreeTableRenderer } from "./section-tree-table-renderer"
import { SectionTableProvider } from "./section-table-context"
import type { TreeTableRow } from "./section-tree-table"

/**
 * `SectionTreeTable` is the flat `SectionTable` grid PLUS a parent/child
 * hierarchy: every node is a fully-functional row (editable cells, selection,
 * sort, per-column filter) and a parent node expands/collapses its children —
 * the SAME TanStack row-expansion the Pivot section uses, but over real editable
 * records. It suits any naturally nested list; the canonical case is a chart of
 * accounts (Class → Group → Synthetic → Analytical). Structural tier nodes
 * (`selectable: false`) render label-only and can't be selected or edited.
 */
const meta = {
  title: "Blocks/Content Panel/SectionTreeTable",
  component: SectionTreeTableRenderer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        <SectionTableProvider>
          <div className="flex h-[540px] flex-col border border-border-subtle">
            <Story />
          </div>
        </SectionTableProvider>
      </IconProvider>
    ),
  ],
} satisfies Meta<typeof SectionTreeTableRenderer>

export default meta
type Story = StoryObj<typeof meta>

/** A leaf account row (real record — editable + selectable). */
function account(
  number: string,
  name: string,
  category: string,
  type: string,
  saldo: string,
  tax: string,
  subRows?: TreeTableRow[],
): TreeTableRow {
  return {
    id: number,
    values: { number, name, category, type, saldo, tax },
    subRows,
  }
}

/** A structural tier node (Class / Group) — label-only, not selectable/editable. */
function tier(
  number: string,
  name: string,
  subRows: TreeTableRow[],
): TreeTableRow {
  return {
    id: `tier:${number}`,
    values: { number, name },
    subRows,
    selectable: false,
    editable: false,
  }
}

const TREE: TreeTableRow[] = [
  tier("0", "Dlouhodobý majetek", [
    tier("01", "Dlouhodobý nehmotný majetek", [
      account(
        "012",
        "Nehmotné výsledky vývoje",
        "Rozvahové",
        "Aktiva",
        "Ne",
        "Ne",
        [
          account(
            "012.001",
            "Software vlastní",
            "Rozvahové",
            "Aktiva",
            "Ne",
            "Ne",
          ),
          account("012.002", "Licence", "Rozvahové", "Aktiva", "Ne", "Ano"),
        ],
      ),
      account("013", "Software", "Rozvahové", "Aktiva", "Ne", "Ne"),
    ]),
    tier("02", "Dlouhodobý hmotný majetek odpisovaný", [
      account("021", "Stavby", "Rozvahové", "Aktiva", "Ne", "Ne", [
        account(
          "021.001",
          "Administrativní budova",
          "Rozvahové",
          "Aktiva",
          "Ne",
          "Ne",
        ),
      ]),
      account("022", "Hmotné movité věci", "Rozvahové", "Aktiva", "Ne", "Ne", [
        account("022.001", "Stroje", "Rozvahové", "Aktiva", "Ne", "Ne"),
        account("022.002", "Vozidla", "Rozvahové", "Aktiva", "Ne", "Ano"),
      ]),
    ]),
  ]),
  tier("3", "Zúčtovací vztahy", [
    tier("31", "Pohledávky (krátkodobé i dlouhodobé)", [
      account("311", "Odběratelé", "Rozvahové", "Aktiva", "Ano", "Ne", [
        account(
          "311.001",
          "Odběratelé tuzemsko",
          "Rozvahové",
          "Aktiva",
          "Ano",
          "Ne",
        ),
        account("311.002", "Odběratelé EU", "Rozvahové", "Aktiva", "Ano", "Ne"),
      ]),
    ]),
  ]),
]

const CATEGORY = [
  { value: "Rozvahové", label: "Rozvahové" },
  { value: "Výsledkové", label: "Výsledkové" },
]
const TYPE = [
  { value: "Aktiva", label: "Aktiva" },
  { value: "Pasiva", label: "Pasiva" },
]
const YES_NO = [
  { value: "Ano", label: "Ano" },
  { value: "Ne", label: "Ne" },
]

/** A chart of accounts: 4 tiers, editable name, faceted category/type, saldo/tax flags. */
export const ChartOfAccounts: Story = {
  args: {
    props: {
      features: { search: true, inspect: false, rowActions: false },
      defaultExpanded: 2,
      columns: [
        {
          id: "number",
          header: "Číslo účtu",
          kind: "text",
          role: "id",
          width: 260,
        },
        {
          id: "name",
          header: "Název",
          kind: "text",
          edit: "inline",
          width: 240,
        },
        {
          id: "category",
          header: "Kategorie",
          kind: "badge",
          options: CATEGORY,
          enableFilter: true,
          width: 140,
        },
        {
          id: "type",
          header: "Typ účtu",
          kind: "badge",
          options: TYPE,
          enableFilter: true,
          width: 120,
        },
        {
          id: "saldo",
          header: "Saldokonto",
          kind: "select",
          edit: "inline",
          options: YES_NO,
          align: "end",
          width: 130,
        },
        {
          id: "tax",
          header: "Daňový",
          kind: "select",
          edit: "inline",
          options: YES_NO,
          align: "end",
          width: 110,
        },
      ],
      rows: TREE,
      emptyText: "No accounts.",
    },
  },
}

/** Fully expanded on load (`defaultExpanded: true`). */
export const FullyExpanded: Story = {
  args: {
    props: {
      ...ChartOfAccounts.args!.props!,
      defaultExpanded: true,
    },
  },
}
