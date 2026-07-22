"use client"

// Screen-only action bar: save/load the local XML working file (the only
// persistence), reuse stored parties, and the two resets. Marked .no-print.

import { useRef } from "react"

import { Button } from "@workspace/ui/components/button"

import { useFakturace } from "../_lib/state"
import {
  docFilename,
  downloadXml,
  importDocFile,
  serializeDoc,
} from "../_lib/xml"

export function Toolbar() {
  const { doc, loadDoc, resetAll, resetServices } = useFakturace()
  const fileInput = useRef<HTMLInputElement>(null)

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    try {
      loadDoc(await importDocFile(file))
    } catch {
      window.alert(
        "Soubor se nepodařilo načíst — očekává se pracovní XML soubor /fakturace.",
      )
    }
  }

  return (
    <div className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white/95 p-2 backdrop-blur">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => downloadXml(docFilename(doc), serializeDoc(doc))}
      >
        Uložit soubor (XML)
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInput.current?.click()}
      >
        Načíst soubor (XML)
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/xml,text/xml,.xml"
        className="hidden"
        onChange={(e) => {
          void handleImport(e.target.files?.[0])
          e.target.value = ""
        }}
      />

      <span className="mx-1 h-5 w-px bg-neutral-200" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          if (
            window.confirm(
              "Vymazat služby, zálohy a údaje faktury? Strany zůstanou.",
            )
          )
            resetServices()
        }}
      >
        Nová faktura (zachovat strany)
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          if (window.confirm("Opravdu vymazat všechna zadaná data?")) resetAll()
        }}
      >
        Reset vše
      </Button>
    </div>
  )
}
