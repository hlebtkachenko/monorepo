"use client"

import { useState } from "react"

import { ArchetypeDetails } from "@workspace/ui/blocks/archetypes"
import {
  sectionDetailsForm,
  sectionDetailsGroup,
  sectionDetailsTable,
  sectionDetailsTabs,
  sectionSpace,
} from "@workspace/ui/blocks/content-panel"
import type { LeafSectionDescriptor } from "@workspace/ui/blocks/content-panel"

/** A "Legal identity" Details Form section (a group child). */
function legalIdentity(): LeafSectionDescriptor {
  return sectionDetailsForm({
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
 * An "Addresses" Details Tabs section — each tab is a DIFFERENT address kind with
 * its own distinct fields, so switching tabs visibly swaps the form below (not a
 * placeholder). A group child.
 */
function addressesTabs(): LeafSectionDescriptor {
  const text = (label: string, name: string, span: 1 | 2 | 3 | 4 | 5 | 6) => ({
    label,
    name,
    span,
    control: { kind: "text" as const },
  })
  return sectionDetailsTabs({
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
 * A READONLY "Bank accounts" Details Table (the sketch) — display cells, a
 * "Primary" flag rendered as a green success badge or an em dash, and two action
 * buttons: "+ New" appends a blank editable row (real, local state); "Import from
 * Excel" is a `link` that navigates (real wiring is the page's job). A group child.
 */
function bankAccounts(): LeafSectionDescriptor {
  return sectionDetailsTable({
    anchor: "bank-accounts",
    title: "Bank accounts",
    description:
      "Used on invoices and for párování plateb. The primary account prints by default.",
    mode: "readonly",
    columns: [
      { id: "iban", header: "IBAN", display: { kind: "mono" } },
      { id: "bank", header: "Bank" },
      {
        id: "currency",
        header: "Currency",
        edit: {
          kind: "select",
          options: [
            { label: "CZK", value: "CZK" },
            { label: "EUR", value: "EUR" },
          ],
        },
        display: { kind: "badge", tone: "neutral" },
      },
      {
        id: "primary",
        header: "Primary",
        align: "end",
        display: { kind: "badge-or-dash", tone: "success" },
      },
    ],
    rows: [
      {
        id: "cs",
        cells: {
          iban: "CZ65 0800 0000 1920 0014 5399",
          bank: "Česká spořitelna",
          currency: "CZK",
          primary: "Primary",
        },
      },
      {
        id: "fio",
        cells: {
          iban: "CZ12 2010 0000 0029 0148 1234",
          bank: "Fio banka",
          currency: "EUR",
          primary: "",
        },
      },
    ],
    actions: [
      { id: "new", label: "New", icon: "add" },
      {
        id: "import",
        label: "Import from Excel",
        icon: "import",
        behavior: "link",
        href: "?import=bank-accounts",
      },
    ],
  })
}

/**
 * An EDITABLE "Contact people" Details Table — every existing row is inputs,
 * editable in place; "+ Add person" appends a blank removable row. A group child.
 */
function contacts(): LeafSectionDescriptor {
  return sectionDetailsTable({
    anchor: "contacts",
    title: "Contact people",
    description:
      "Statutory representatives and daily contacts. Edited inline; saved with the page.",
    mode: "editable",
    columns: [
      { id: "name", header: "Name", edit: { kind: "text" } },
      {
        id: "role",
        header: "Role",
        edit: {
          kind: "select",
          placeholder: "Select…",
          options: [
            { label: "Jednatel", value: "jednatel" },
            { label: "Účetní", value: "ucetni" },
            { label: "Kontakt", value: "kontakt" },
          ],
        },
      },
      {
        id: "email",
        header: "Email",
        edit: { kind: "text", placeholder: "name@example.cz" },
      },
    ],
    rows: [
      {
        id: "r1",
        cells: { name: "Jan Novák", role: "jednatel", email: "jan@acme.cz" },
      },
      {
        id: "r2",
        cells: { name: "Eva Dvořáková", role: "ucetni", email: "eva@acme.cz" },
      },
    ],
    actions: [{ id: "add", label: "Add person", icon: "add" }],
  })
}

/**
 * Client view for the Archetype Details debug page — the Details archetype with
 * two Groups ("Company" holding a Form + a Tabs section, "Banking & contacts"
 * holding a readonly + an editable Table), plus a Save footer. Branded section
 * descriptors must be minted inside the client boundary.
 */
export function ArchetypeDetailsView() {
  const [dirty, setDirty] = useState(true)
  return (
    <ArchetypeDetails
      title="Archetype Details"
      sections={[
        sectionSpace(),
        sectionDetailsGroup({
          title: "Company",
          anchor: "company",
          sections: [legalIdentity(), addressesTabs()],
        }),
        sectionSpace(),
        sectionDetailsGroup({
          title: "Banking & contacts",
          anchor: "banking",
          sections: [bankAccounts(), contacts()],
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
