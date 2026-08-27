"use client"

// Section 2 — their company (odběratel) identification.

import { PartyForm } from "./party-form"
import { Section } from "./fields"

export function Customer() {
  return (
    <Section
      id="customer"
      title="2. Odběratel (klient)"
      description="Identifikace klienta, kterému fakturujete."
    >
      <PartyForm which="customer" />
    </Section>
  )
}
