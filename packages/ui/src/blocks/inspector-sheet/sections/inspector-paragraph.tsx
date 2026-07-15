"use client"

import * as React from "react"

import { Textarea } from "@workspace/ui/components/textarea"
import { type IconName } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { useInspectorEditing } from "./inspector-edit-context"
import { InspectorSection } from "./inspector-section"

export interface InspectorParagraphProps {
  title?: string
  icon?: IconName
  /** Rich prose body — plain text or formatted nodes (links, emphasis, …). */
  children: React.ReactNode
  /** Right-aligned header slot (e.g. a "Regenerate" button). */
  action?: React.ReactNode
  /** Footer slot under the prose (e.g. a "Submit for review" button). */
  footer?: React.ReactNode
  /** Plain-text value edited in a Textarea while the body is in edit mode. Pass
   * with `onChange` to make the paragraph editable; omit for a static block. */
  editValue?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * InspectorParagraph — a titled block of prose for descriptions or AI summaries.
 * The title sits above, outside any box; the prose sits directly on the body (no
 * card). When the body enters edit mode and an `editValue` + `onChange` pair is
 * supplied, the prose swaps to a Textarea. The optional `footer` slot carries an
 * action (e.g. "Submit for review").
 */
export function InspectorParagraph({
  title,
  icon,
  children,
  action,
  footer,
  editValue,
  onChange,
  placeholder,
  className,
}: InspectorParagraphProps) {
  const editing = useInspectorEditing()
  const editable = editing && onChange != null
  const [draft, setDraft] = React.useState(() => editValue ?? "")

  return (
    <InspectorSection
      title={title}
      icon={icon}
      action={action}
      className={className}
      contentClassName="flex flex-col gap-3"
    >
      {editable ? (
        <Textarea
          value={draft}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value)
            onChange?.(e.target.value)
          }}
          className="min-h-24 text-sm"
        />
      ) : (
        <div
          className={cn(
            "text-sm leading-relaxed text-muted-foreground",
            "[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline",
            "[&_strong]:font-medium [&_strong]:text-foreground",
          )}
        >
          {children}
        </div>
      )}
      {footer ? <div>{footer}</div> : null}
    </InspectorSection>
  )
}
