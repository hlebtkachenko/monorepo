"use client"

// Identification block editor — binds every OrgConfig field to the context.
// Screen-only chrome (marked .no-print by the caller / page).

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useOrg, type OrgTextKey } from "../_lib/org-context"
import { lookupAresForVykazy } from "../_lib/ares-action"

const INPUT_CLASS =
  "rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-black outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"

interface FieldProps {
  label: string
  field: OrgTextKey
  placeholder?: string
  className?: string
}

function Field({ label, field, placeholder, className }: FieldProps) {
  const { org, setOrgText } = useOrg()
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      <input
        type="text"
        value={org[field]}
        placeholder={placeholder}
        onChange={(e) => setOrgText(field, e.target.value)}
        className={INPUT_CLASS}
      />
    </label>
  )
}

type AresStatus = "idle" | "loading" | "success" | "error"

/** IČO input paired with a "Načíst z ARES" button that fills the header. */
function IcoField() {
  const { org, setOrgText, patchOrg } = useOrg()
  const [status, setStatus] = useState<AresStatus>("idle")
  const [message, setMessage] = useState("")

  const load = async () => {
    setStatus("loading")
    setMessage("")
    const result = await lookupAresForVykazy(org.ico)
    if (result.ok) {
      patchOrg(result.data)
      setStatus("success")
      setMessage("Údaje byly načteny z ARES.")
    } else {
      setStatus("error")
      setMessage(result.error)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-600">IČO</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={org.ico}
          onChange={(e) => setOrgText("ico", e.target.value)}
          className={cn(INPUT_CLASS, "min-w-[7rem] flex-1")}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={status === "loading" || org.ico.trim() === ""}
          onClick={() => void load()}
        >
          {status === "loading" ? "Načítám…" : "Načíst z ARES"}
        </Button>
      </div>
      {message ? (
        <span
          className={cn(
            "text-xs",
            status === "error" ? "text-red-600" : "text-green-600",
          )}
        >
          {message}
        </span>
      ) : null}
    </div>
  )
}

export function OrgForm() {
  const { org, setVTisicich } = useOrg()

  return (
    <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">
        Identifikace účetní jednotky
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Obchodní firma / název"
          field="nazev"
          className="sm:col-span-2"
        />
        <IcoField />
        <Field
          label="Sídlo (ulice, č.p.)"
          field="sidlo"
          className="sm:col-span-2"
        />
        <Field label="PSČ" field="psc" />
        <Field label="Obec" field="obec" />
        <Field label="Stát" field="stat" />
        <Field label="Právní forma" field="pravniForma" />
        <Field
          label="Předmět podnikání"
          field="predmetPodnikani"
          className="sm:col-span-2 lg:col-span-3"
        />
        <Field label="Rok" field="rok" placeholder="2025" />
        <Field label="Měsíc" field="mesic" placeholder="12" />
        <Field label="Ke dni" field="keDni" placeholder="31.12.2025" />
        <Field label="Sestaveno dne" field="sestavenoDne" />
        <Field label="Schváleno dne" field="schvalenoDne" />
        <label className="flex items-end gap-2 pb-1">
          <input
            type="checkbox"
            checked={org.vTisicich}
            onChange={(e) => setVTisicich(e.target.checked)}
            className="size-4 accent-blue-600"
          />
          <span className="text-sm text-neutral-700">v celých tisících Kč</span>
        </label>
      </div>
    </section>
  )
}
