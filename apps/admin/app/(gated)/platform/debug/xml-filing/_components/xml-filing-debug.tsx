"use client"

// Operator XML-filing debug board (Platform ▸ Debug ▸ XML filing). Import a filing XML
// (DPPO / DPHDP3 / DPHKH1 / ISDOC), round-trip it through @workspace/filing, and see:
// the detected format, the XSD validity of the re-generated document, whether the
// round-trip is lossless, the DPPO kritické kontroly (warn-only), the parsed model, and
// the re-serialized XML (downloadable). Prod-live — admin is staff-only, no dev gate.

import * as React from "react"
import { Download, FileCheck2, FileX2, Upload } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  inspectFilingAction,
  type FilingFormat,
  type FilingInspectResult,
} from "../actions"

const FORMATS: { value: FilingFormat | "auto"; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "dppo", label: "DPPO" },
  { value: "dphdp3", label: "DPHDP3" },
  { value: "dphkh1", label: "DPHKH1" },
  { value: "isdoc", label: "ISDOC" },
]

export function XmlFilingDebug() {
  const [xml, setXml] = React.useState("")
  const [format, setFormat] = React.useState<FilingFormat | "auto">("auto")
  const [result, setResult] = React.useState<FilingInspectResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const fileRef = React.useRef<HTMLInputElement>(null)

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setXml(await file.text())
    setResult(null)
    setError(null)
  }

  const onInspect = () => {
    if (xml.trim() === "") return
    startTransition(async () => {
      const res = await inspectFilingAction(
        xml,
        format === "auto" ? undefined : format,
      )
      if (res.ok) {
        setResult(res.result)
        setError(null)
      } else {
        setResult(null)
        setError(res.error)
      }
    })
  }

  const onDownload = () => {
    if (!result) return
    const blob = new Blob([result.outputXml], { type: "application/xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${result.format}-export.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <p className="text-sm text-muted-foreground">
        Vložte nebo nahrajte XML písemnost (DPPO/DPHDP3/DPHKH1 nebo ISDOC).
        Nástroj ji načte, znovu vygeneruje, ověří proti oficiálnímu XSD a u DPPO
        spustí kritické kontroly. Ověřuje engine, neodesílá na FÚ.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {FORMATS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={format === f.value ? "default" : "outline"}
              onClick={() => setFormat(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="mx-1 h-5 w-px bg-border" />
        <input
          ref={fileRef}
          type="file"
          accept=".xml,.isdoc,text/xml,application/xml"
          className="hidden"
          onChange={(e) => void onUpload(e)}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
        >
          <Upload /> Nahrát
        </Button>
        <Button
          size="sm"
          onClick={onInspect}
          disabled={pending || xml.trim() === ""}
        >
          {pending ? "Ověřuji…" : "Ověřit (import → export)"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDownload}
          disabled={!result}
        >
          <Download /> Stáhnout výstup
        </Button>
      </div>

      <Textarea
        value={xml}
        onChange={(e) => setXml(e.target.value)}
        placeholder='<?xml version="1.0"?><Pisemnost><DPPDP9 …/></Pisemnost>'
        className="min-h-40 shrink-0 font-mono text-xs"
        spellCheck={false}
      />

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{result.label}</Badge>
            <Badge variant="outline">verze {result.version}</Badge>
            {result.valid ? (
              <Badge variant="secondary" className="gap-1">
                <FileCheck2 className="size-3.5" /> XSD valid
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <FileX2 className="size-3.5" /> XSD invalid (
                {result.errors.length})
              </Badge>
            )}
            <Badge variant={result.idempotent ? "secondary" : "destructive"}>
              {result.idempotent ? "round-trip lossless" : "round-trip liší se"}
            </Badge>
          </div>

          {result.errors.length > 0 ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 font-mono text-xs text-destructive">
              {result.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          ) : null}

          {result.warnings.length > 0 ? (
            <div className="rounded-md border border-border p-2 text-xs">
              <div className="mb-1 font-medium text-amber-600 dark:text-amber-500">
                Kritické kontroly ({result.warnings.length}) — upozornění
              </div>
              <ul className="space-y-0.5">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2">
                    {w.field ? (
                      <span className="font-mono text-muted-foreground">
                        {w.field}
                      </span>
                    ) : null}
                    <span>{w.message}</span>
                    {w.suggestion ? (
                      <span className="text-emerald-600 dark:text-emerald-500">
                        → {w.suggestion}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <details open>
            <summary className="cursor-pointer text-sm font-medium">
              Výstupní XML (import → export)
            </summary>
            <pre className="mt-1 max-h-72 overflow-auto rounded-md border border-border p-2 font-mono text-xs">
              {result.outputXml}
            </pre>
          </details>

          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Načtený model (JSON)
            </summary>
            <pre className="mt-1 max-h-72 overflow-auto rounded-md border border-border p-2 font-mono text-xs">
              {result.modelJson}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  )
}
