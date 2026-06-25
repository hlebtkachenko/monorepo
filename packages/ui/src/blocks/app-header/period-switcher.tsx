"use client"

import { cn } from "@workspace/ui/lib/utils"
import { useIcons } from "@workspace/ui/icon-packs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import {
  HEADER_MENU,
  HEADER_SWITCHER_TRIGGER,
  HeaderMenuTrigger,
  MENU_GAP,
} from "./header-menu"

/** One accounting period the org can be scoped to. */
export interface AccountingPeriod {
  /** Stable id (used as React key + the switch value). */
  id: string
  /** Full display label — the `MM.YYYY – MM.YYYY` range. Shown in the dropdown. */
  label: string
  /**
   * Compact label for the header trigger only. For a full calendar year
   * (Jan–Dec) this is just the year; otherwise the full range. Falls back to
   * `label` when omitted.
   */
  headerLabel?: string
  /** Closed (locked) vs still open. Drives the lock / lock-open glyph. */
  closed: boolean
}

export interface PeriodSwitcherProps {
  /** All periods this org has, newest first. */
  periods: AccountingPeriod[]
  /** id of the active period. */
  value: string
  /** Select a period. */
  onValueChange?: (id: string) => void
  /** "Add period" action. */
  onAddPeriod?: () => void
  /** "Manage periods" action — opens the full period-management surface. */
  onManagePeriods?: () => void
  /** Applied to the trigger button (e.g. responsive visibility). */
  className?: string
}

/**
 * Accounting-period (účetní období) switcher for the AppHeader `leftContent`
 * slot. Trigger: calendar icon + the active `MM.YYYY – MM.YYYY` range +
 * chevron. The dropdown lists every period with a lock (closed) / lock-open
 * (open) glyph on the LEFT before the range, the active one checked, plus an
 * "Add period" action.
 *
 * Presentational + controlled — the surface wrapper owns the period data and
 * selection (same data-in pattern as the rest of the app-shell blocks).
 */
export function PeriodSwitcher({
  periods,
  value,
  onValueChange,
  onAddPeriod,
  onManagePeriods,
  className,
}: PeriodSwitcherProps) {
  const icons = useIcons()
  const CalendarGlyph = icons.CalendarIcon
  const ChevronIcon = icons.ChevronDown
  const LockGlyph = icons.Lock
  const LockOpenGlyph = icons.LockOpen
  const CheckGlyph = icons.Check
  const AddGlyph = icons.Plus
  const ManageGlyph = icons.Calendars
  const ExternalGlyph = icons.ArrowUpRight

  const active = periods.find((p) => p.id === value)

  return (
    <TooltipProvider delayDuration={200}>
      <DropdownMenu modal={false}>
        <HeaderMenuTrigger tooltip="Accounting period">
          <button
            type="button"
            aria-label="Switch accounting period"
            className={cn(
              HEADER_SWITCHER_TRIGGER,
              "max-w-[200px] text-[length:var(--icon-label-size)]",
              className,
            )}
          >
            <CalendarGlyph className="size-[var(--icon-size)] shrink-0 text-icon" />
            <span className="min-w-0 truncate py-1 leading-none">
              {active?.headerLabel ?? active?.label ?? "–"}
            </span>
            <ChevronIcon className="size-4 shrink-0 text-icon" />
          </button>
        </HeaderMenuTrigger>

        <DropdownMenuContent
          align="start"
          sideOffset={MENU_GAP}
          className={cn(HEADER_MENU, "min-w-fit")}
        >
          <DropdownMenuLabel>Accounting periods</DropdownMenuLabel>
          {periods.map((period) => (
            <DropdownMenuItem
              key={period.id}
              onSelect={() => onValueChange?.(period.id)}
            >
              {period.closed ? (
                <LockGlyph className="text-muted-foreground" />
              ) : (
                // Open period — brand (logomark) green, light + dark variants.
                <LockOpenGlyph className="text-brand-primary-light dark:text-brand-primary-dark" />
              )}
              <span className="truncate">{period.label}</span>
              {period.id === value && (
                // gap-2 (8px item gap) + ml-2 (8px) = 16px from the date.
                <CheckGlyph className="ml-2 size-4 shrink-0 text-foreground" />
              )}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => onAddPeriod?.()}>
            <AddGlyph />
            Add period
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onManagePeriods?.()}>
            <ManageGlyph />
            Manage periods
            <ExternalGlyph className="ml-auto size-3" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  )
}
