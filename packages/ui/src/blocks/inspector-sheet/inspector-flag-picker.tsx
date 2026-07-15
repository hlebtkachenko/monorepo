"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

export type InspectorFlagTone =
  "none" | "destructive" | "success" | "warning" | "info" | "purple"

export interface InspectorFlagValue {
  tone: InspectorFlagTone
}

interface FlagChoice {
  tone: Exclude<InspectorFlagTone, "none">
  label: string
}

const FLAG_CHOICES: FlagChoice[] = [
  { tone: "destructive", label: "Red" },
  { tone: "success", label: "Green" },
  { tone: "warning", label: "Amber" },
  { tone: "info", label: "Blue" },
  { tone: "purple", label: "Purple" },
]

/**
 * Static Tailwind class map: every tone's text color is a literal class
 * string here so Tailwind's compiler can see it (no dynamic `text-${tone}`
 * construction).
 */
const TONE_TEXT_CLASSES: Record<Exclude<InspectorFlagTone, "none">, string> = {
  destructive: "text-destructive",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  purple: "text-purple",
}

function FlagGlyph({
  tone,
  className,
}: {
  tone: InspectorFlagTone
  className?: string
}) {
  const icons = useIcons()
  const FlagIcon = icons.Flag
  return (
    <FlagIcon
      data-flag-state={tone === "none" ? "none" : "filled"}
      className={cn(
        "size-4 shrink-0",
        tone === "none" ? "text-muted-foreground" : TONE_TEXT_CLASSES[tone],
        tone !== "none" && "fill-current",
        className,
      )}
    />
  )
}

export interface InspectorFlagPickerProps {
  value: InspectorFlagValue
  onValueChange: (value: InspectorFlagValue) => void
}

/**
 * InspectorFlagPicker: the record's tone flag, none or one of five filled
 * semantic tones. Trigger reflects the current selection; the dropdown lists
 * every tone plus "None".
 */
export function InspectorFlagPicker({
  value,
  onValueChange,
}: InspectorFlagPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Flag"
        className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-grey-subtle outline-none hover:bg-icon-hover-bg focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <FlagGlyph tone={value.tone} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuItem
          onSelect={() => onValueChange({ tone: "none" })}
          data-active={value.tone === "none" || undefined}
        >
          <FlagGlyph tone="none" />
          None
        </DropdownMenuItem>
        {FLAG_CHOICES.map((choice) => (
          <DropdownMenuItem
            key={choice.tone}
            onSelect={() => onValueChange({ tone: choice.tone })}
            data-active={value.tone === choice.tone || undefined}
          >
            <FlagGlyph tone={choice.tone} />
            {choice.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
