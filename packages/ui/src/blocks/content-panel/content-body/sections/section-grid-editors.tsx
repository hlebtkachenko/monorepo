"use client"

import * as React from "react"

import {
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import {
  ComboboxItemCreatable,
  CreatableCombobox,
  isCreatableItem,
  type CreatableItem,
} from "@workspace/ui/components/creatable-combobox"
import { Input } from "@workspace/ui/components/input"
import { CircleCheckBig, Ellipsis, Maximize2 } from "@workspace/ui/lib/icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import type {
  TableCellValue,
  TableColumnOption,
  TableColumnSpec,
} from "./section-table"

/**
 * section-grid-editors — the SHARED inline cell editors + cell affordances used by
 * BOTH the flat Table renderer (`section-table-renderer`) and the Tree-table
 * renderer (`section-tree-table-renderer`). Mirrors the existing shared-cell
 * pattern (`section-grid-cells`, `section-grid-select`): a change to how an
 * inline editor looks or commits lands in one place and both grids inherit it —
 * never copy-pasted per section.
 */

/** Look up a `select` / `badge` option label; fall back to the raw value. */
export function optionLabel(
  spec: TableColumnSpec,
  value: TableCellValue,
): string {
  const found = spec.options?.find((o) => o.value === String(value ?? ""))
  return found?.label ?? String(value ?? "")
}

/** An inline text/number editor filling its grid cell (spreadsheet-style). */
export function TextEditCell({
  value,
  numeric,
  name,
  ariaLabel,
  onCommit,
}: {
  value: TableCellValue
  numeric: boolean
  name?: string
  /** Accessible name for the bare inline input (no visible label in a cell). */
  ariaLabel: string
  onCommit: (value: TableCellValue) => void
}) {
  const [draft, setDraft] = React.useState(String(value ?? ""))
  // Re-sync the draft when the committed value changes (edit applied, or the
  // rows reseeded) — the render-time reset pattern, not an effect.
  const [prevValue, setPrevValue] = React.useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setDraft(String(value ?? ""))
  }
  // Escape resets the draft and blurs; this flag tells the ensuing blur-commit
  // to cancel rather than persist the reverted draft.
  const cancelRef = React.useRef(false)
  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false
      setDraft(String(value ?? ""))
      return
    }
    if (!numeric) {
      // Skip a no-op commit (blur without a change → no server round-trip).
      if (draft === String(value ?? "")) return
      onCommit(draft)
      return
    }
    const trimmed = draft.trim()
    if (trimmed === "") {
      // Empty clears to null — but only if it wasn't already null.
      if (value !== null) onCommit(null)
      return
    }
    const parsed = Number(trimmed)
    // Never commit NaN / Infinity — reject the draft and restore the last value.
    if (!Number.isFinite(parsed)) {
      setDraft(String(value ?? ""))
      return
    }
    if (parsed === value) return
    onCommit(parsed)
  }
  return (
    <Input
      name={name}
      aria-label={ariaLabel}
      value={draft}
      // "decimal" (not "numeric") so negative + fractional amounts are typable.
      inputMode={numeric ? "decimal" : "text"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        else if (e.key === "Escape") {
          cancelRef.current = true
          e.currentTarget.blur()
        }
      }}
      className={cn(
        // `dark:bg-transparent` overrides the Input's own `dark:bg-input/30` (a
        // `dark:` variant that would otherwise win over a plain `bg-transparent`)
        // — else an inline-editable cell shows a lighter field box behind its
        // text in dark mode. The idle editor inherits the row surface.
        "h-8 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent",
        numeric && "text-right tabular-nums",
      )}
    />
  )
}

/** An inline Select editor filling its grid cell. */
export function SelectEditCell({
  spec,
  value,
  name,
  onCommit,
}: {
  spec: TableColumnSpec
  value: TableCellValue
  name?: string
  onCommit: (value: TableCellValue) => void
}) {
  return (
    <Select value={String(value ?? "")} onValueChange={onCommit} name={name}>
      <SelectTrigger
        size="sm"
        aria-label={spec.header}
        className="h-8 w-full rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {spec.options?.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * An inline CREATABLE select editor (for a `creatable: true` column, e.g. a
 * counterparty picker built around a directory). Same slot as `SelectEditCell`,
 * but backed by `CreatableCombobox`: type to search the existing options, or
 * confirm "Create …" to mint a brand-new value. Picking an option commits it;
 * creating a value commits it AND calls `onCreate` so the renderer adds it to the
 * column's live options (and the page persists it). `options` is the column's
 * CURRENT option set (grows as values are created).
 */
export function CreatableSelectEditCell({
  options,
  value,
  ariaLabel,
  onCommit,
  onCreate,
}: {
  options: readonly TableColumnOption[]
  value: TableCellValue
  ariaLabel: string
  onCommit: (value: TableCellValue) => void
  onCreate: (value: string) => void
}) {
  const items = React.useMemo(
    () => options.map((o) => ({ value: o.value, label: o.label })),
    [options],
  )
  const selected = items.find((o) => o.value === String(value ?? "")) ?? null
  return (
    <CreatableCombobox
      items={items}
      value={selected}
      onValueChange={(next) => {
        // A real option OR the creatable item — both carry the underlying value
        // (the creatable item's value is the raw typed text). Commit it either
        // way; `onCreate` (fired on close) then persists a truly-new option.
        const picked = next as { value?: string } | null
        onCommit(picked?.value ?? null)
      }}
      onCreateValue={onCreate}
    >
      <ComboboxInput
        aria-label={ariaLabel}
        placeholder="—"
        showClear={false}
        className="h-8 rounded-none border-0 bg-transparent px-0 shadow-none dark:bg-transparent"
      />
      <ComboboxContent>
        <ComboboxList>
          {(item: { value: string; label: string } | CreatableItem) =>
            isCreatableItem(item) ? (
              <ComboboxItemCreatable key="__create__" value={item} />
            ) : (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )
          }
        </ComboboxList>
      </ComboboxContent>
    </CreatableCombobox>
  )
}

/**
 * Right-pinned per-row actions (the `rowActions` feature) — the ONE primary
 * action placeholder + overflow menu a surface needs (e.g. Approve on Posting
 * Approval). Handlers land per consumer later — the icons are the slots. The
 * Open-inspector button is NOT here — it lives in the identity column (see
 * `InspectorOpenButton`).
 */
export function RowActionsCell() {
  const action =
    "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
  return (
    <div className="flex items-center justify-center gap-0.5">
      <button type="button" aria-label="Approve" className={action}>
        <CircleCheckBig className="size-4" />
      </button>
      <button type="button" aria-label="More actions" className={action}>
        <Ellipsis className="size-4" />
      </button>
    </div>
  )
}

/**
 * The Open-inspector affordance, right-aligned in the identity (`role: "id"`)
 * cell and revealed on row hover (idle when not hovered, like the leading select
 * column's number↔checkbox swap). A white boxed icon button: a 22×22 box with
 * the same border as an unselected checkbox (`--grid-checkbox-border`), a
 * `--grid-action-icon` (#646464) `size-3.5` glyph (proportionate to the smaller
 * box — a `size-4` looked oversized), a `--grid-action-hover` (#e5e5e5) hover
 * fill, and an "Open Inspector" tooltip. Its right edge sits at the cell's
 * `px-3` so the gap mirrors the left inset; `mousedown` is stopped so pressing
 * it never grabs the cell's focus ring.
 */
export function InspectorOpenButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Open inspector"
          onMouseDown={(event) => event.stopPropagation()}
          // Also stop the click so opening the inspector never toggles the row's
          // expansion (the Tree-table identity cell is a whole-cell click zone).
          onClick={(event) => {
            event.stopPropagation()
            onClick()
          }}
          className="flex size-[22px] shrink-0 items-center justify-center rounded-md border border-grid-checkbox-border bg-background text-grid-action-icon opacity-0 transition-[opacity,background-color] group-hover/row:opacity-100 hover:bg-grid-action-hover focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Open Inspector</TooltipContent>
    </Tooltip>
  )
}
