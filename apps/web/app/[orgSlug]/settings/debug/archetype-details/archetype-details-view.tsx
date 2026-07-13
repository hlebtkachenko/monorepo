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

/**
 * An "Addresses" Tabs section — each tab is a DIFFERENT address kind with its
 * own distinct fields, so switching tabs visibly swaps the form below (not a
 * placeholder). A group child.
 */
function addressesTabs(): LeafSectionDescriptor {
  const text = (label: string, name: string, span: 1 | 2 | 3 | 4 | 5 | 6) => ({
    label,
    name,
    span,
    control: { kind: "text" as const },
  })
  return sectionTabs({
    anchor: "addresses",
    title: "Addresses",
    description:
      "Sídlo prints on every přiznání and výkaz. Mailing and establishment are optional.",
    tabs: [
      {
        id: "sidlo",
        label: "Registered seat (sídlo)",
        fields: [
          text("Street", "sidlo_street", 6),
          text("House no. (č.p.)", "sidlo_cp", 2),
          text("Orientation (č.o.)", "sidlo_co", 2),
          text("Postal code", "sidlo_zip", 2),
          text("City", "sidlo_city", 3),
          text("Region (kraj)", "sidlo_region", 3),
        ],
      },
      {
        id: "mail",
        label: "Mailing address",
        fields: [
          text("Recipient / c/o", "mail_recipient", 6),
          text("PO box or street", "mail_street", 6),
          text("City", "mail_city", 3),
          text("Postal code", "mail_zip", 3),
        ],
      },
      {
        id: "prov",
        label: "Provozovna",
        fields: [
          text("Establishment name", "prov_name", 6),
          text("Street", "prov_street", 4),
          text("Establishment ID (RÚIAN)", "prov_ruian", 2),
          text("City", "prov_city", 3),
          text("Postal code", "prov_zip", 3),
        ],
      },
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
