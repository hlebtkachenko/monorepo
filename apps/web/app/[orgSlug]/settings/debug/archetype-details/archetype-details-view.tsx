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
 * its own distinct fields, so switching tabs visibly swaps the form below. A
 * group child.
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
 * EDITABLE "Bank accounts" Details Table — text + dropdown columns on the fixed
 * 6-track grid (IBAN 2 · Bank 2 · Currency 1 · actions 1). Rows read-only until
 * their Edit icon flips them to inputs; "Add account" appends an editable row,
 * "Import from Excel" is a real navigation link. A group child.
 */
function bankAccounts(): LeafSectionDescriptor {
  return sectionDetailsTable({
    anchor: "bank-accounts",
    title: "Bank accounts",
    description:
      "Used on invoices and for párování plateb. Edit inline; saved with the page.",
    mode: "editable",
    name: "bank_accounts",
    columns: [
      { id: "iban", header: "IBAN", span: 2, control: { kind: "text" } },
      { id: "bank", header: "Bank", span: 2, control: { kind: "text" } },
      {
        id: "currency",
        header: "Currency",
        span: 1,
        control: {
          kind: "select",
          options: [
            { label: "CZK", value: "CZK" },
            { label: "EUR", value: "EUR" },
          ],
        },
      },
    ],
    rows: [
      {
        id: "cs",
        cells: {
          iban: "CZ65 0800 0000 1920 0014 5399",
          bank: "Česká spořitelna",
          currency: "CZK",
        },
      },
      {
        id: "fio",
        cells: {
          iban: "CZ12 2010 0000 0029 0148 1234",
          bank: "Fio banka",
          currency: "EUR",
        },
      },
    ],
    addLabel: "Add account",
    actions: [
      {
        id: "import",
        label: "Import from Excel",
        icon: "import",
        href: "?import=bank-accounts",
      },
    ],
  })
}

/**
 * EDITABLE "Contact people" Details Table — showcases the tags control (Emails)
 * alongside text + dropdown. Name 2 · Role 1 · Emails 2 · actions 1. A group child.
 */
function contacts(): LeafSectionDescriptor {
  return sectionDetailsTable({
    anchor: "contacts",
    title: "Contact people",
    description:
      "Statutory representatives and daily contacts. Edit inline; saved with the page.",
    mode: "editable",
    name: "contacts",
    columns: [
      { id: "name", header: "Name", span: 2, control: { kind: "text" } },
      {
        id: "role",
        header: "Role",
        span: 1,
        control: {
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
        id: "emails",
        header: "Emails",
        span: 2,
        control: { kind: "tags", placeholder: "Add email…" },
      },
    ],
    rows: [
      {
        id: "r1",
        cells: { name: "Jan Novák", role: "jednatel", emails: ["jan@acme.cz"] },
      },
      {
        id: "r2",
        cells: {
          name: "Eva Dvořáková",
          role: "ucetni",
          emails: ["eva@acme.cz", "ucetni@acme.cz"],
        },
      },
    ],
    addLabel: "Add person",
  })
}

/**
 * READ-ONLY "Registrations" Details Table — synced from public registries, so it
 * cannot be configured from this page: no Add, no Edit/Delete column, pure
 * display. Registry 2 · Number 2 · Status 2. A group child.
 */
function registrations(): LeafSectionDescriptor {
  return sectionDetailsTable({
    anchor: "registrations",
    title: "Registrations",
    description:
      "Synced from public registries (ARES, registr plátců DPH). Read-only here.",
    mode: "readonly",
    editHint: {
      text: "To edit these details, go to",
      linkLabel: "Company identity",
      href: "../section-form",
    },
    columns: [
      {
        id: "registry",
        header: "Registry",
        span: 2,
        control: { kind: "text" },
      },
      { id: "number", header: "Number", span: 2, control: { kind: "text" } },
      { id: "status", header: "Status", span: 2, control: { kind: "text" } },
    ],
    rows: [
      {
        id: "or",
        cells: {
          registry: "Obchodní rejstřík",
          number: "C 12345 / MS Praha",
          status: "Active",
        },
      },
      {
        id: "dph",
        cells: {
          registry: "Registr plátců DPH",
          number: "CZ12345678",
          status: "Registered",
        },
      },
    ],
  })
}

/**
 * Client view for the Archetype Details debug page — the Details archetype with
 * a "Company" group (Form + Tabs) and a "Banking, contacts & registrations" group
 * (two editable Tables + one read-only Table), plus a Save footer. Branded section
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
        sectionDetailsGroup({
          title: "Banking, contacts & registrations",
          anchor: "banking",
          sections: [bankAccounts(), contacts(), registrations()],
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
