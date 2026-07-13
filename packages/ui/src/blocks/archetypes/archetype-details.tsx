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
} from "@workspace/ui/blocks/content-panel"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"

export interface ArchetypeDetailsProps {
  /** Page title shown in the content header (no view tabs). */
  title: string
  /** Optional ancestor trail left of the title. */
  breadcrumb?: ContentHeaderBreadcrumbItem[]
  /**
   * The body: any number of branded Sections (e.g. `sectionForm(...)`,
   * `sectionSpace(...)`), rendered in order and stacked; the body scrolls.
   */
  sections: readonly SectionDescriptor[]
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
  save,
}: ArchetypeDetailsProps) {
  return (
    <>
      <AppPageHeader>
        <ContentHeader title={title} breadcrumb={breadcrumb} />
      </AppPageHeader>
      <ContentPanel
        sections={sections}
        footer={save != null ? <ContentFooter save={save} /> : undefined}
      />
    </>
  )
}
