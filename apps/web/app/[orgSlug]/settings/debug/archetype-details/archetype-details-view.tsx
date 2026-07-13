"use client"

import { useState } from "react"

import { ArchetypeDetails } from "@workspace/ui/blocks/archetypes"
import {
  sectionForm,
  sectionSpace,
  sectionTitle,
} from "@workspace/ui/blocks/content-panel"
import type { SectionDescriptor } from "@workspace/ui/blocks/content-panel"

/**
 * Builds a "Legal identity" form section. `suffix` keeps field ids unique when
 * the section is rendered more than once on a page; `anchor` is its deep-link id.
 */
function legalIdentity(suffix: string, anchor: string): SectionDescriptor {
  return sectionForm({
    anchor,
    title: "Legal identity",
    description: "How this účetní jednotka is named on filings and výkazy.",
    fields: [
      {
        label: "Legal name",
        name: `legal_name_${suffix}`,
        span: 4,
        control: { kind: "text", value: "Developer Workspace" },
      },
      {
        label: "Legal form",
        name: `legal_form_${suffix}`,
        span: 2,
        control: {
          kind: "select",
          placeholder: "Not set",
          options: [
            { label: "s.r.o.", value: "sro" },
            { label: "a.s.", value: "as" },
          ],
        },
      },
      {
        label: "IČO",
        name: `ico_${suffix}`,
        span: 2,
        control: {
          kind: "text",
          placeholder: "00000000",
          inputMode: "numeric",
        },
      },
      {
        label: "DIČ",
        name: `dic_${suffix}`,
        span: 2,
        control: { kind: "text", placeholder: "—", disabled: true },
        hover: {
          title: "DIČ — daňové identifikační číslo",
          description:
            "Issued by the finanční úřad for every company, even non-VAT payers, and required when dealing with the FÚ.",
        },
      },
      {
        label: "Person kind",
        name: `person_kind_${suffix}`,
        span: 2,
        control: { kind: "text", value: "legal_entity", disabled: true },
      },
    ],
  })
}

/**
 * Client view for the Archetype Details debug page — the Details archetype with
 * two stacked Form sections (one plus a duplicate below) and a Save footer.
 * Branded section descriptors must be minted inside the client boundary.
 */
export function ArchetypeDetailsView() {
  const [dirty, setDirty] = useState(true)
  return (
    <ArchetypeDetails
      title="Archetype Details"
      sections={[
        sectionSpace(),
        sectionTitle({ title: "Company", anchor: "company", topRule: true }),
        legalIdentity("a", "legal-identity"),
        legalIdentity("b", "legal-identity-2"),
      ]}
      save={{
        dirty,
        onSave: () => setDirty(false),
        onDiscard: () => setDirty(false),
      }}
    />
  )
}
