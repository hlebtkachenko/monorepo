"use client"

import {
  ContentFooter,
  ContentHeader,
  ContentPanel,
} from "@workspace/ui/blocks/content-panel"
import type {
  ContentFooterSave,
  ContentHeaderBreadcrumbItem,
  SectionDescriptor,
  SectionAction,
} from "@workspace/ui/blocks/content-panel"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"

export interface ArchetypeDetailsProps {
  /** Page title shown in the content header (no view tabs). */
  title: string
  /** Optional ancestor trail left of the title. */
  breadcrumb?: ContentHeaderBreadcrumbItem[]
  /**
   * The body: any number of branded Sections (e.g. `sectionDetailsForm(...)`,
   * `sectionSpace(...)`), rendered in order and stacked; the body scrolls.
   */
  sections: readonly SectionDescriptor[]
  /** Handles action ids emitted by interactive section controls. */
  onSectionAction?: (action: SectionAction) => void
  /**
   * Optional Save / Discard footer for a dirty record. Self-hides when
   * `dirty` is false. Omit entirely for a read-only Details page.
   */
  save?: ContentFooterSave
}

/**
 * ArchetypeDetails — the Details archetype: a layout for the WHOLE Content Panel
 * of a detail / settings page. It composes the reusable blocks + sections, no
 * hardcoded chrome:
 *   - ContentHeader — title only, NO view tabs
 *   - no ContentToolbar
 *   - ContentBody — as MANY branded Sections as the page wants (stacked, scrolls)
 *   - ContentFooter — optional Save / Discard bar
 * Fed data; owns the composition. Pages supply `sections` and (optionally) the
 * `save` footer state.
 */
export function ArchetypeDetails({
  title,
  breadcrumb,
  sections,
  onSectionAction,
  save,
}: ArchetypeDetailsProps) {
  return (
    <>
      <AppPageHeader>
        <ContentHeader title={title} breadcrumb={breadcrumb} />
      </AppPageHeader>
      <ContentPanel
        sections={sections}
        onSectionAction={onSectionAction}
        footer={save != null ? <ContentFooter save={save} /> : undefined}
      />
    </>
  )
}
