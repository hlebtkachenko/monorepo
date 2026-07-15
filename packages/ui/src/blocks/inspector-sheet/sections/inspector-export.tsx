"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useIcons } from "@workspace/ui/icon-packs"

import { InspectorSection } from "./inspector-section"

/** One target document format the export can render to. */
export interface InspectorExportFormat {
  value: string
  label: string
  /** Muted note shown after the label in the picker. */
  hint?: string
}

/** One toggleable field the export can include. */
export interface InspectorExportField {
  id: string
  label: string
  description?: string
  defaultChecked?: boolean
}

export interface InspectorExportProps {
  title?: string
  /** Format choices. Defaults to PDF · ISDOC · XLSX · CSV. */
  formats?: InspectorExportFormat[]
  /** Selectable fields to include in the output. */
  fields?: InspectorExportField[]
  /** Initially selected format value. Defaults to the first format. */
  defaultFormat?: string
  /** Pre-filled recipient for the "send to email" row. */
  defaultEmail?: string
  onPrint?: () => void
  onExport?: (format: string, fieldIds: string[]) => void
  onSendEmail?: (email: string, format: string) => void
  className?: string
}

const DEFAULT_FORMATS: InspectorExportFormat[] = [
  { value: "pdf", label: "PDF", hint: "Printable document" },
  { value: "isdoc", label: "ISDOC", hint: "Czech e-invoice XML" },
  { value: "xlsx", label: "XLSX", hint: "Spreadsheet" },
  { value: "csv", label: "CSV", hint: "Plain rows" },
]

/** A small muted sub-heading above a control group. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium text-muted-foreground">
      {children}
    </span>
  )
}

/**
 * InspectorExport — the Export tab's surface: pick a format, choose which fields
 * to include, then print / download / email the record. Design only for now —
 * the handlers are wired later; the controls own their local UI state so the tab
 * is interactive in isolation. English throughout; tokens + our primitives only.
 */
export function InspectorExport({
  title = "Export",
  formats = DEFAULT_FORMATS,
  fields,
  defaultFormat,
  defaultEmail = "",
  onPrint,
  onExport,
  onSendEmail,
  className,
}: InspectorExportProps) {
  const icons = useIcons()
  const PrinterIcon = icons.Printer
  const DownloadIcon = icons.FileDown
  const SendIcon = icons.Send

  const [format, setFormat] = React.useState(
    defaultFormat ?? formats[0]?.value ?? "",
  )
  const [checked, setChecked] = React.useState<Set<string>>(
    () =>
      new Set(
        (fields ?? [])
          .filter((field) => field.defaultChecked !== false)
          .map((field) => field.id),
      ),
  )
  const [email, setEmail] = React.useState(defaultEmail)

  const toggleField = (id: string, next: boolean) =>
    setChecked((prev) => {
      const draft = new Set(prev)
      if (next) draft.add(id)
      else draft.delete(id)
      return draft
    })

  return (
    <InspectorSection
      title={title}
      description="Print, download, or email this record."
      className={className}
      contentClassName="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <GroupLabel>Format</GroupLabel>
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a format" />
          </SelectTrigger>
          <SelectContent>
            {formats.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="font-medium">{option.label}</span>
                {option.hint ? (
                  <span className="text-muted-foreground">{option.hint}</span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {fields && fields.length > 0 ? (
        <div className="flex flex-col gap-2">
          <GroupLabel>Include fields</GroupLabel>
          <div className="flex flex-col divide-y divide-border-subtle rounded-md border border-border-subtle">
            {fields.map((field) => (
              <Label
                key={field.id}
                htmlFor={`export-field-${field.id}`}
                className="flex items-start gap-3 px-3 py-2.5 font-normal"
              >
                <Checkbox
                  id={`export-field-${field.id}`}
                  className="mt-0.5"
                  checked={checked.has(field.id)}
                  onCheckedChange={(next) =>
                    toggleField(field.id, next === true)
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{field.label}</span>
                  {field.description ? (
                    <span className="block text-xs text-muted-foreground">
                      {field.description}
                    </span>
                  ) : null}
                </span>
              </Label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => onPrint?.()}
        >
          <PrinterIcon aria-hidden />
          Print
        </Button>
        <Button
          className="flex-1"
          onClick={() => onExport?.(format, Array.from(checked))}
        >
          <DownloadIcon aria-hidden />
          Export
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <GroupLabel>Send to email</GroupLabel>
        <div className="flex gap-2">
          <Input
            type="email"
            inputMode="email"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="flex-1"
          />
          <Button
            variant="secondary"
            disabled={email.trim().length === 0}
            onClick={() => onSendEmail?.(email, format)}
          >
            <SendIcon aria-hidden />
            Send
          </Button>
        </div>
      </div>
    </InspectorSection>
  )
}
