"use client"

import { useState } from "react"

import { ArchetypeDetails } from "@workspace/ui/blocks/archetypes"
import {
  sectionForm,
  sectionGroup,
  sectionSpace,
  sectionTabs,
} from "@workspace/ui/blocks/content-panel"
import type { LeafSectionDescriptor } from "@workspace/ui/blocks/content-panel"

/** A "Legal identity" Form section (a group child). */
function legalIdentity(): LeafSectionDescriptor {
  return sectionForm({
    anchor: "legal-identity",
    title: "Legal identity",
    description: "How this účetní jednotka is named on filings and výkazy.",
    fields: [
      {
        label: "Legal name",
        name: "legal_name",
        span: 4,
        control: { kind: "text", value: "Developer Workspace" },
      },
      {
        label: "Legal form",
        name: "legal_form",
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
        name: "ico",
        span: 2,
        control: {
          kind: "text",
          placeholder: "00000000",
          inputMode: "numeric",
        },
      },
      {
        label: "DIČ",
        name: "dic",
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
        name: "person_kind",
        span: 2,
        control: { kind: "text", value: "legal_entity", disabled: true },
      },
    ],
  })
}

/** An "Addresses" Tabs section — each address kind is a tab (a group child). */
function addressesTabs(): LeafSectionDescriptor {
  const addressFields = (prefix: string) => [
    {
      label: "Street",
      name: `${prefix}_street`,
      span: 6 as const,
      control: { kind: "text" as const, placeholder: "Ulice" },
    },
    {
      label: "House no. (č.p.)",
      name: `${prefix}_cp`,
      span: 2 as const,
      control: { kind: "text" as const },
    },
    {
      label: "Orientation (č.o.)",
      name: `${prefix}_co`,
      span: 2 as const,
      control: { kind: "text" as const },
    },
    {
      label: "Postal code",
      name: `${prefix}_zip`,
      span: 2 as const,
      control: { kind: "text" as const },
    },
    {
      label: "City",
      name: `${prefix}_city`,
      span: 3 as const,
      control: { kind: "text" as const },
    },
    {
      label: "Region (kraj)",
      name: `${prefix}_region`,
      span: 3 as const,
      control: { kind: "text" as const },
    },
  ]
  return sectionTabs({
    anchor: "addresses",
    title: "Addresses",
    description:
      "Sídlo prints on every přiznání and výkaz. Mailing and establishment are optional.",
    tabs: [
      {
        id: "sidlo",
        label: "Registered seat (sídlo)",
        fields: addressFields("sidlo"),
      },
      { id: "mail", label: "Mailing address", fields: addressFields("mail") },
      { id: "prov", label: "Provozovna", fields: addressFields("prov") },
    ],
  })
}

/**
 * Client view for the Archetype Details debug page — the Details archetype with
 * one Group ("Company") that holds a Form section and a Tabs section, plus a
 * Save footer. Branded section descriptors must be minted inside the client
 * boundary.
 */
export function ArchetypeDetailsView() {
  const [dirty, setDirty] = useState(true)
  return (
    <ArchetypeDetails
      title="Archetype Details"
      sections={[
        sectionSpace(),
        sectionGroup({
          title: "Company",
          anchor: "company",
          sections: [legalIdentity(), addressesTabs()],
        }),
      ]}
      save={{
        dirty,
        onSave: () => setDirty(false),
        onDiscard: () => setDirty(false),
      }}
    />
  )
}
