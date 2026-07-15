"use client"

// Dependency direction: content-panel → inspector-sheet, ONE-directional. This
// is safe ONLY because no inspector-sheet code imports content-panel (its README
// mentions DetailsTableGrid, but nothing under blocks/inspector-sheet imports it).
// If an inspector section ever needs a content-panel value, inject it — do NOT add
// the reverse import, or this registry becomes a module cycle.
import {
  InspectorActivityLog,
  type InspectorActivityLogProps,
  InspectorAttachments,
  type InspectorAttachmentsProps,
  InspectorExport,
  type InspectorExportProps,
  InspectorKeyDetails,
  type InspectorKeyDetailsProps,
  InspectorLinkedRecords,
  type InspectorLinkedRecordsProps,
  InspectorMoneyTotals,
  type InspectorMoneyTotalsProps,
  InspectorParagraph,
  type InspectorParagraphProps,
  InspectorSection,
} from "@workspace/ui/blocks/inspector-sheet"

import {
  defineSection,
  type SectionDescriptor,
  type SectionMeta,
} from "./section"
import {
  DetailsTableGrid,
  type DetailsTableGridProps,
} from "./section-details-table-renderer"

/**
 * Inspector sections, registered into the ONE Section system (Doc-01 §6) — not a
 * parallel registry. Each reuses an existing `@workspace/ui/blocks/inspector-sheet`
 * body component behind an `inspector-*` kind, so composing an Inspector tab is
 * the same "add a branded descriptor to the list" contract as an archetype body:
 * `SectionList` renders these through the closed `SECTION_REGISTRY`, no hardcoding.
 *
 * The `inspector-table` kind wraps the shared `DetailsTableGrid` in an
 * `InspectorSection` frame (title above), the inspector's editable per-row table
 * for posting / invoice items / open items — narrowed to `min-w-0` for the rail.
 */

/** `inspector-table` props: a titled DetailsTableGrid tuned for the rail. */
export interface InspectorTableSectionProps extends DetailsTableGridProps {
  readonly title?: string
}

export function sectionInspectorKeyDetails(
  props: InspectorKeyDetailsProps,
  meta?: SectionMeta,
): SectionDescriptor<"inspector-key-details", InspectorKeyDetailsProps> {
  return defineSection("inspector-key-details", props, meta)
}

export function sectionInspectorMoneyTotals(
  props: InspectorMoneyTotalsProps,
  meta?: SectionMeta,
): SectionDescriptor<"inspector-money-totals", InspectorMoneyTotalsProps> {
  return defineSection("inspector-money-totals", props, meta)
}

export function sectionInspectorTable(
  props: InspectorTableSectionProps,
  meta?: SectionMeta,
): SectionDescriptor<"inspector-table", InspectorTableSectionProps> {
  return defineSection("inspector-table", props, meta)
}

export function sectionInspectorParagraph(
  props: InspectorParagraphProps,
  meta?: SectionMeta,
): SectionDescriptor<"inspector-paragraph", InspectorParagraphProps> {
  return defineSection("inspector-paragraph", props, meta)
}

export function sectionInspectorLinkedRecords(
  props: InspectorLinkedRecordsProps,
  meta?: SectionMeta,
): SectionDescriptor<"inspector-linked-records", InspectorLinkedRecordsProps> {
  return defineSection("inspector-linked-records", props, meta)
}

export function sectionInspectorActivityLog(
  props: InspectorActivityLogProps,
  meta?: SectionMeta,
): SectionDescriptor<"inspector-activity-log", InspectorActivityLogProps> {
  return defineSection("inspector-activity-log", props, meta)
}

export function sectionInspectorAttachments(
  props: InspectorAttachmentsProps,
  meta?: SectionMeta,
): SectionDescriptor<"inspector-attachments", InspectorAttachmentsProps> {
  return defineSection("inspector-attachments", props, meta)
}

export function sectionInspectorExport(
  props: InspectorExportProps,
  meta?: SectionMeta,
): SectionDescriptor<"inspector-export", InspectorExportProps> {
  return defineSection("inspector-export", props, meta)
}

// ── Renderers: one per kind, each unwrapping the descriptor onto its component ──

export function SectionInspectorKeyDetailsRenderer({
  props,
}: {
  props: InspectorKeyDetailsProps
}) {
  return <InspectorKeyDetails {...props} />
}

export function SectionInspectorMoneyTotalsRenderer({
  props,
}: {
  props: InspectorMoneyTotalsProps
}) {
  return <InspectorMoneyTotals {...props} />
}

export function SectionInspectorTableRenderer({
  props,
}: {
  props: InspectorTableSectionProps
}) {
  const { title, minWidthClassName = "min-w-0", ...grid } = props
  return (
    <InspectorSection title={title}>
      <DetailsTableGrid {...grid} minWidthClassName={minWidthClassName} />
    </InspectorSection>
  )
}

export function SectionInspectorParagraphRenderer({
  props,
}: {
  props: InspectorParagraphProps
}) {
  return <InspectorParagraph {...props} />
}

export function SectionInspectorLinkedRecordsRenderer({
  props,
}: {
  props: InspectorLinkedRecordsProps
}) {
  return <InspectorLinkedRecords {...props} />
}

export function SectionInspectorActivityLogRenderer({
  props,
}: {
  props: InspectorActivityLogProps
}) {
  return <InspectorActivityLog {...props} />
}

export function SectionInspectorAttachmentsRenderer({
  props,
}: {
  props: InspectorAttachmentsProps
}) {
  return <InspectorAttachments {...props} />
}

export function SectionInspectorExportRenderer({
  props,
}: {
  props: InspectorExportProps
}) {
  return <InspectorExport {...props} />
}
