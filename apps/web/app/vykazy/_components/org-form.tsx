"use client"

// Identification block editor — binds every OrgConfig field to the context.
// Screen-only chrome (marked .no-print by the caller / page).

import { useEffect, useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useOrg, type OrgTextKey } from "../_lib/org-context"
import { lookupAresForVykazy } from "../_lib/ares-action"
import {
  loadTemplates,
  parseTemplatesJson,
  saveTemplates,
  templatesJson,
  upsertTemplate,
  type OrgTemplate,
} from "../_lib/org-templates"

const INPUT_CLASS =
  "rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"

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
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
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
      <span className="text-xs font-medium text-muted-foreground">IČO</span>
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
            status === "error" ? "text-destructive" : "text-green-600",
          )}
        >
          {message}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Save / recall the whole identification block by name.
 *
 * Hydrated in an effect rather than in the initial state: localStorage does not
 * exist during the server render, and reading it eagerly would mismatch.
 */
function TemplatePicker() {
  const { org, patchOrg } = useOrg()
  const [templates, setTemplates] = useState<OrgTemplate[]>([])
  const [selected, setSelected] = useState("")
  const importInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client-only localStorage hydration on mount; server render intentionally starts with no templates */
    setTemplates(loadTemplates())
  }, [])

  const persist = (next: OrgTemplate[]) => {
    setTemplates(next)
    saveTemplates(next)
  }

  const name = org.nazev.trim()

  const apply = (value: string) => {
    setSelected(value)
    const template = templates.find((t) => t.name === value)
    if (template) patchOrg(template.org)
  }

  const exportTemplates = () => {
    const blob = new Blob([templatesJson(templates)], {
      type: "application/json;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "vykazy-sablony.json"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  // Imported templates are MERGED, not swapped in: `upsertTemplate` matches on
  // name, so a file refreshes the firms it carries and leaves the rest alone.
  const importTemplates = async (file: File | undefined) => {
    if (!file) return
    let incoming: OrgTemplate[]
    try {
      incoming = parseTemplatesJson(await file.text())
    } catch {
      window.alert(
        'Soubor se nepodařilo načíst — očekává se JSON ve formátu "vykazy-org-templates".',
      )
      return
    }
    if (incoming.length === 0) {
      window.alert("Soubor neobsahuje žádnou šablonu.")
      return
    }
    persist(incoming.reduce(upsertTemplate, templates))
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <select
        value={selected}
        onChange={(e) => apply(e.target.value)}
        className={cn(INPUT_CLASS, "min-w-[14rem]")}
        aria-label="Uložená šablona"
      >
        <option value="">— uložená šablona —</option>
        {templates.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={name === ""}
        onClick={() => {
          persist(upsertTemplate(templates, { name, org }))
          setSelected(name)
        }}
      >
        Uložit jako šablonu
      </Button>
      {selected ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            persist(templates.filter((t) => t.name !== selected))
            setSelected("")
          }}
        >
          Smazat
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={templates.length === 0}
        onClick={exportTemplates}
      >
        Export šablon
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => importInput.current?.click()}
      >
        Import šablon
      </Button>
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          void importTemplates(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      <span className="text-xs text-muted-foreground">
        Uloženo jen v tomto prohlížeči.
      </span>
    </div>
  )
}

export function OrgForm() {
  const { org, setVTisicich } = useOrg()

  return (
    <section className="rounded-lg border border-border bg-muted/40 p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        Identifikace účetní jednotky
      </h2>
      <TemplatePicker />
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
          <span className="text-sm text-foreground">v celých tisících Kč</span>
        </label>
      </div>
    </section>
  )
}
