"use client"

import { ArchetypeDetails } from "@workspace/ui/blocks/archetypes"
import {
  type ContentHeaderBreadcrumbItem,
  type SectionDetailsFormProps,
  type SectionDetailsTableProps,
  sectionDetailsForm,
  sectionDetailsGroup,
  sectionDetailsTable,
} from "@workspace/ui/blocks/content-panel"

type ProfileDetailsSection =
  | {
      readonly kind: "form"
      readonly props: SectionDetailsFormProps
    }
  | {
      readonly kind: "table"
      readonly props: SectionDetailsTableProps
    }

export interface ReadOnlyProfileDetailsGroup {
  readonly title: string
  readonly sections: readonly ProfileDetailsSection[]
}

interface ReadOnlyProfileDetailsProps {
  readonly title: string
  readonly breadcrumb?: ContentHeaderBreadcrumbItem[]
  readonly groups: readonly ReadOnlyProfileDetailsGroup[]
}

export function ReadOnlyProfileDetails({
  title,
  breadcrumb = [{ label: "Profile", href: "/workspace/profile" }],
  groups,
}: ReadOnlyProfileDetailsProps) {
  return (
    <ArchetypeDetails
      title={title}
      breadcrumb={breadcrumb}
      sections={groups.map((group) =>
        sectionDetailsGroup({
          title: group.title,
          sections: group.sections.map((section) => {
            switch (section.kind) {
              case "form":
                return sectionDetailsForm(section.props)
              case "table":
                return sectionDetailsTable(section.props)
            }
          }),
        }),
      )}
    />
  )
}
