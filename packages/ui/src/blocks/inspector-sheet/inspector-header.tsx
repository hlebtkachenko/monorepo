"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { Kbd } from "@workspace/ui/components/kbd"
import { useIcons } from "@workspace/ui/icon-packs"

/** What the header's Copy dropdown copies. */
export type InspectorCopyTarget = "link" | "number" | "id"

export interface InspectorHeaderProps {
  breadcrumb: readonly [string, string]
  /** Navigate to the previous item. Omit to disable (first item). */
  onPrevious?: () => void
  /** Navigate to the next item. Omit to disable (last item). */
  onNext?: () => void
  /** Copy dropdown — link (shareable), the header number, or the record id. */
  onCopy?: (what: InspectorCopyTarget) => void
  onSwitchLayout?: () => void
  onClose?: () => void
}

/**
 * InspectorSheet's fixed 40px header: previous/next navigation, a two-item
 * breadcrumb trail, then the right-aligned action cluster (copy, switch layout,
 * close). Every action is disabled when its handler is omitted. Secondary
 * actions (the old ⋯) now live in the rail's "More" tab, not the header.
 */
export function InspectorHeader({
  breadcrumb,
  onPrevious,
  onNext,
  onCopy,
  onSwitchLayout,
  onClose,
}: InspectorHeaderProps) {
  const [first, second] = breadcrumb
  const icons = useIcons()
  const ChevronRight = icons.ChevronRight
  const LinkIcon = icons.LinkIcon
  const HashIcon = icons.HashIcon
  const IdCard = icons.IdCard

  return (
    <div
      data-slot="inspector-header"
      className="flex h-[42px] shrink-0 items-center gap-1 border-b border-border-subtle px-2"
    >
      <IconButton
        size="sm"
        icon="ChevronUp"
        aria-label="Previous item"
        tooltip="Previous item"
        tooltipSide="bottom"
        disabled={!onPrevious}
        onClick={onPrevious}
      />
      <IconButton
        size="sm"
        icon="ChevronDown"
        aria-label="Next item"
        tooltip="Next item"
        tooltipSide="bottom"
        disabled={!onNext}
        onClick={onNext}
      />

      <span className="ml-1 flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground">
        <span className="truncate">{first}</span>
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate font-medium text-foreground">{second}</span>
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            size="sm"
            icon="Copy"
            aria-label="Copy"
            tooltip="Copy"
            tooltipSide="bottom"
            disabled={!onCopy}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onCopy?.("link")}>
            <LinkIcon aria-hidden />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCopy?.("number")}>
            <HashIcon aria-hidden />
            Copy number
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCopy?.("id")}>
            <IdCard aria-hidden />
            Copy ID
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <IconButton
        size="sm"
        icon="Maximize2"
        aria-label="Switch layout"
        tooltip="Switch layout"
        tooltipSide="bottom"
        disabled={!onSwitchLayout}
        onClick={onSwitchLayout}
      />
      <IconButton
        size="sm"
        icon="X"
        aria-label="Close inspector"
        tooltip={
          <>
            <span>Close window</span>
            <Kbd>Esc</Kbd>
          </>
        }
        tooltipSide="bottom"
        disabled={!onClose}
        onClick={onClose}
        // The close glyph reads ~20% larger than the other header icons.
        className="[&_svg]:size-[1.2rem]"
      />
    </div>
  )
}
