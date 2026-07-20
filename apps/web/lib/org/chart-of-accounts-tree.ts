import type { TreeTableRow } from "@workspace/ui/blocks/content-panel"

import type { ChartAccountView } from "./accounting"

/**
 * Project the flat chart of accounts into the tree the Účtový rozvrh page renders.
 *
 * Pure + locale-independent apart from the injected `className` resolver, so it
 * unit-tests without a DB or a locale. Enum/boolean cells are stored as RAW codes
 * (`"BALANCE_SHEET"`, `"yes"`, …) — the client view localizes them to labels via
 * each column's `options`, which keeps this transform i18n-free and keeps faceting
 * keyed on stable values, never on translated text.
 */

/** Serialize one account's flags into the raw, i18n-free cell codes the tree
 *  stores. A null flag stays null (rendered as an em dash on a real row). The
 *  account `id` rides along (not a column) so the row Inspector can identify the
 *  record it edits — the tree node id is not surfaced to the inspector callbacks. */
function accountValues(a: ChartAccountView): Record<string, string | null> {
  return {
    id: a.id,
    number: a.number,
    name: a.name,
    statementClass: a.statementClass,
    accountType: a.accountType,
    normalBalance: a.normalBalance,
    tracksOpenItems: a.tracksOpenItems ? "yes" : "no",
    taxRelevant: a.taxRelevant == null ? null : a.taxRelevant ? "yes" : "no",
  }
}

/**
 * Project the flat, number-sorted chart of accounts into the 4-tier forest the
 * Tree-table renders: Class → Group → Synthetic → Analytical.
 *
 * - Class + Group are STRUCTURAL tier nodes (no backing record): `selectable` and
 *   `editable` false, so the renderer draws them label-only and never sweeps them
 *   into a selection. Class carries its statutory name (`className`); Group carries
 *   only its 2-digit code (group names are a later reference-i18n follow-up).
 * - Synthetic + Analytical are REAL account rows, nested by `parentId` to any depth
 *   (multi-level analytics survive), so every real account is fully wired (select,
 *   sort, filter, export). An analytical whose synthetic parent is absent from the
 *   set is promoted to a root under its own Class/Group rather than silently dropped.
 *
 * Input order (account number ascending, as `getChartAccounts` returns) is
 * preserved — it is the tree's default display order.
 */
export function buildChartTree(
  accounts: readonly ChartAccountView[],
  className: (cls: number) => string,
): TreeTableRow[] {
  const ids = new Set(accounts.map((a) => a.id))
  // Children by parent id — real accounts nest by `parentId`. Roots (parentId
  // null, OR a parentId pointing at an absent account) become top-level records.
  const childrenByParent = new Map<string, ChartAccountView[]>()
  const roots: ChartAccountView[] = []
  for (const a of accounts) {
    if (a.parentId == null || !ids.has(a.parentId)) {
      roots.push(a)
      continue
    }
    const list = childrenByParent.get(a.parentId)
    if (list) list.push(a)
    else childrenByParent.set(a.parentId, [a])
  }

  const accountNode = (a: ChartAccountView): TreeTableRow => {
    const kids = childrenByParent.get(a.id)
    return {
      id: a.id,
      values: accountValues(a),
      subRows: kids && kids.length > 0 ? kids.map(accountNode) : undefined,
    }
  }

  // Bucket the roots into Class → Group, preserving input order (JS Maps keep
  // insertion order, and the input is number-sorted).
  const classes = new Map<number, Map<string, ChartAccountView[]>>()
  for (const s of roots) {
    const groupCode = s.groupCode ?? s.syntheticCode.slice(0, 2)
    let groups = classes.get(s.class)
    if (!groups) {
      groups = new Map<string, ChartAccountView[]>()
      classes.set(s.class, groups)
    }
    const bucket = groups.get(groupCode)
    if (bucket) bucket.push(s)
    else groups.set(groupCode, [s])
  }

  const tree: TreeTableRow[] = []
  for (const [cls, groups] of classes) {
    const groupNodes: TreeTableRow[] = []
    for (const [groupCode, synthetics] of groups) {
      groupNodes.push({
        id: `group:${groupCode}`,
        values: { number: groupCode },
        subRows: synthetics.map(accountNode),
        selectable: false,
        editable: false,
      })
    }
    tree.push({
      id: `class:${cls}`,
      values: { number: String(cls), name: className(cls) },
      subRows: groupNodes,
      selectable: false,
      editable: false,
    })
  }
  return tree
}
