"use client"

import {
  ContentHeader,
  ContentPanel,
  sectionEmpty,
} from "@workspace/ui/blocks/content-panel"
import type { ContentHeaderBreadcrumbItem } from "@workspace/ui/blocks/content-panel"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"

export interface ArchetypeBlankProps {
  /** Page title shown in the content header (no view tabs). */
  title: string
  /** Optional ancestor trail left of the title. */
  breadcrumb?: ContentHeaderBreadcrumbItem[]
  /** Copy for the single full-height `Empty` section that fills the body. */
  emptyTitle?: string
}

/**
 * ArchetypeBlank — the Blank archetype: a layout for the WHOLE Content Panel of
 * a page with nothing in it. It composes the reusable blocks + a section, with
 * no hardcoded chrome:
 *   - ContentHeader — title only, NO view tabs
 *   - no ContentToolbar
 *   - ContentBody — ONE full-height `Empty` section
 *   - no ContentFooter
 * Fed data; owns the composition. (The archetype is "Blank"; the section it
 * places is "Empty" — two different layers.)
 */
export function ArchetypeBlank({
  title,
  breadcrumb,
  emptyTitle,
}: ArchetypeBlankProps) {
  return (
    <>
      <AppPageHeader>
        <ContentHeader title={title} breadcrumb={breadcrumb} />
      </AppPageHeader>
      <ContentPanel sections={[sectionEmpty({ title: emptyTitle })]} />
    </>
  )
}
