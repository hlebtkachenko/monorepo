"use client"

import { IconButton } from "@workspace/ui/components/icon-button"
import type { IconName } from "@workspace/ui/icon-packs"

export type InspectorTab =
  | "details"
  | "items"
  | "activity"
  | "related"
  | "attachments"
  | "export"
  | "more"

const TABS: { tab: InspectorTab; icon: IconName; label: string }[] = [
  { tab: "details", icon: "TextInitialIcon", label: "Details" },
  { tab: "items", icon: "TableProperties", label: "Items" },
  { tab: "activity", icon: "History", label: "Activity" },
  { tab: "related", icon: "ArrowLeftRight", label: "Related" },
  { tab: "attachments", icon: "Paperclip", label: "Attachments" },
  { tab: "export", icon: "FileDown", label: "Export" },
  { tab: "more", icon: "Ellipsis", label: "More" },
]

export interface InspectorRailProps {
  activeTab: InspectorTab
  onTabChange?: (tab: InspectorTab) => void
}

/** InspectorRail — the fixed w-12 tab switcher on the right edge of the sheet. */
export function InspectorRail({ activeTab, onTabChange }: InspectorRailProps) {
  return (
    <div
      data-slot="inspector-rail"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-border-subtle py-2"
    >
      {TABS.map(({ tab, icon, label }) => (
        <IconButton
          key={tab}
          size="sm"
          icon={icon}
          aria-label={label}
          tooltip={label}
          tooltipSide="left"
          active={activeTab === tab}
          disabled={!onTabChange}
          onClick={() => onTabChange?.(tab)}
          className="data-[active]:bg-grey-subtle"
        />
      ))}
    </div>
  )
}
