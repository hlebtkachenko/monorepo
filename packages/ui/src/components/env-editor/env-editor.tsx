"use client"

import * as React from "react"
import { Download, Eye, EyeOff, Plus, Trash2, Upload } from "@workspace/ui/lib/icons"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { makeId } from "@workspace/ui/lib/id"
import { cn } from "@workspace/ui/lib/utils"

interface EnvVariableEntry {
  id: string
  key: string
  value: string
}

function withIds(variables: ReadonlyArray<EnvVariable>): EnvVariableEntry[] {
  return variables.map((v) => ({
    id: makeId("env"),
    key: v.key,
    value: v.value,
  }))
}

function stripIds(entries: ReadonlyArray<EnvVariableEntry>): EnvVariable[] {
  return entries.map(({ key, value }) => ({ key, value }))
}

interface EnvVariable {
  key: string
  value: string
}

interface EnvEditorProps {
  value?: EnvVariable[]
  onChange?: (variables: EnvVariable[]) => void
  readOnly?: boolean
  masked?: boolean
  className?: string
}

const EMPTY_VARIABLES: EnvVariable[] = []

function unescapeQuotedValue(value: string): string {
  // Round-trip with toEnvString: unescape \\, \" and \n inside quoted values.
  let result = ""
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === "\\" && i + 1 < value.length) {
      const next = value[i + 1]
      if (next === "n") {
        result += "\n"
        i++
        continue
      }
      if (next === '"' || next === "\\") {
        result += next
        i++
        continue
      }
    }
    result += ch
  }
  return result
}

function parseEnvString(content: string): EnvVariable[] {
  const lines = content.split("\n")
  const variables: EnvVariable[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const eqIndex = trimmed.indexOf("=")
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    if (value.startsWith('"') && value.endsWith('"')) {
      value = unescapeQuotedValue(value.slice(1, -1))
    } else if (value.startsWith("'") && value.endsWith("'")) {
      // single-quoted values are literal (per dotenv convention)
      value = value.slice(1, -1)
    }

    variables.push({ key, value })
  }

  return variables
}

function toEnvString(variables: EnvVariable[]): string {
  return variables
    .map(({ key, value }) => {
      const needsQuotes =
        value.includes(" ") ||
        value.includes("=") ||
        value.includes("#") ||
        value.includes('"') ||
        value.includes("\\") ||
        value.includes("\n")
      if (needsQuotes) {
        const escaped = value
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n")
        return `${key}="${escaped}"`
      }
      return `${key}=${value}`
    })
    .join("\n")
}

function EnvEditor({
  value = EMPTY_VARIABLES,
  onChange,
  readOnly = false,
  masked: defaultMasked = true,
  className,
}: EnvEditorProps) {
  const [entries, setEntries] = React.useState<EnvVariableEntry[]>(() =>
    withIds(value),
  )
  const [maskedIds, setMaskedIds] = React.useState<Set<string>>(
    () => new Set(entries.map((e) => e.id)),
  )
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const nextEntries = withIds(value)
    setEntries(nextEntries)
    if (defaultMasked) {
      setMaskedIds(new Set(nextEntries.map((e) => e.id)))
    }
  }, [value, defaultMasked])

  const commit = React.useCallback(
    (updated: EnvVariableEntry[]) => {
      setEntries(updated)
      onChange?.(stripIds(updated))
    },
    [onChange],
  )

  const handleAdd = React.useCallback(() => {
    commit([...entries, { id: makeId("env"), key: "", value: "" }])
  }, [entries, commit])

  const handleRemove = React.useCallback(
    (id: string) => {
      commit(entries.filter((e) => e.id !== id))
    },
    [entries, commit],
  )

  const handleChange = React.useCallback(
    (id: string, field: "key" | "value", newValue: string) => {
      commit(
        entries.map((e) => (e.id === id ? { ...e, [field]: newValue } : e)),
      )
    },
    [entries, commit],
  )

  const toggleMask = React.useCallback((id: string) => {
    setMaskedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleExport = React.useCallback(() => {
    const content = toEnvString(stripIds(entries))
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = ".env"
    a.click()
    URL.revokeObjectURL(url)
  }, [entries])

  const handleImport = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (evt) => {
        const content = evt.target?.result as string
        const parsed = withIds(parseEnvString(content))
        setEntries(parsed)
        onChange?.(stripIds(parsed))
        if (defaultMasked) {
          setMaskedIds(new Set(parsed.map((p) => p.id)))
        }
      }
      reader.readAsText(file)

      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    },
    [onChange, defaultMasked],
  )

  return (
    <div
      data-slot="env-editor"
      className={cn(
        "overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2">
        <span className="text-sm font-medium">.env Editor</span>
        {!readOnly && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Import .env file"
            >
              <Upload />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleExport}
              aria-label="Export .env file"
            >
              <Download />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".env,.env.local,.env.development,.env.production"
              onChange={handleImport}
              className="hidden"
            />
          </div>
        )}
      </div>

      <div className="divide-y divide-border">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-2 px-3 py-2"
            role="row"
          >
            <Input
              type="text"
              value={entry.key}
              onChange={(e) => handleChange(entry.id, "key", e.target.value)}
              placeholder="KEY"
              readOnly={readOnly}
              aria-label="Variable name"
              className="flex-1 font-mono"
            />
            <span className="text-muted-foreground" aria-hidden="true">
              =
            </span>
            <div className="flex flex-[2] items-center gap-1">
              <Input
                type={maskedIds.has(entry.id) ? "password" : "text"}
                value={entry.value}
                onChange={(e) =>
                  handleChange(entry.id, "value", e.target.value)
                }
                placeholder="value"
                readOnly={readOnly}
                aria-label={`Value for ${entry.key || "variable"}`}
                className="flex-1 font-mono"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => toggleMask(entry.id)}
                aria-label={
                  maskedIds.has(entry.id) ? "Show value" : "Hide value"
                }
                aria-pressed={maskedIds.has(entry.id)}
              >
                {maskedIds.has(entry.id) ? <Eye /> : <EyeOff />}
              </Button>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleRemove(entry.id)}
                  aria-label={`Remove ${entry.key || "variable"}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>
        ))}

        {entries.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            No environment variables
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="border-t border-border px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAdd}
            aria-label="Add new environment variable"
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus />
            Add variable
          </Button>
        </div>
      )}
    </div>
  )
}

export { EnvEditor }
export type { EnvEditorProps, EnvVariable }
