"use client"

// Section 1 — our company (dodavatel) identification + bank details.

import { useFakturace } from "../_lib/state"
import { PartyForm } from "./party-form"
import { Section, TextField } from "./fields"

export function Supplier() {
  const { doc, setBank } = useFakturace()
  const { bank } = doc

  return (
    <Section
      id="supplier"
      title="1. Dodavatel (naše firma)"
      description="Vaše identifikace a bankovní spojení pro platbu."
    >
      <PartyForm which="supplier" />

      <h3 className="mt-4 mb-2 text-xs font-semibold text-neutral-700">
        Bankovní spojení
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextField
          label="Číslo účtu"
          value={bank.cisloUctu}
          onChange={(v) => setBank({ cisloUctu: v })}
          placeholder="123456789/0800"
        />
        <TextField
          label="Kód banky"
          value={bank.kodBanky}
          onChange={(v) => setBank({ kodBanky: v })}
          placeholder="0800"
        />
        <TextField
          label="Název banky"
          value={bank.nazevBanky}
          onChange={(v) => setBank({ nazevBanky: v })}
        />
        <TextField
          label="IBAN"
          value={bank.iban}
          onChange={(v) => setBank({ iban: v })}
        />
        <TextField
          label="BIC / SWIFT"
          value={bank.bic}
          onChange={(v) => setBank({ bic: v })}
        />
      </div>
    </Section>
  )
}
