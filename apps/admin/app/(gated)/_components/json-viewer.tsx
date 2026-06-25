"use client"

import { useState } from "react"
import { Copy } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  JsonViewer as UiJsonViewer,
  type JsonValue,
} from "@workspace/ui/components/json-viewer"

export interface AdminJsonViewerProps {
  value: unknown
  collapsedDepth?: number
  title?: string
  copyable?: boolean
}

export function JsonViewer({
  value,
  collapsedDepth = 2,
  title,
  copyable = true,
}: AdminJsonViewerProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {title ?? "JSON"}
        </span>
        {copyable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleCopy()}
          >
            <Copy className="size-3" aria-hidden />
            {copied ? "Copied" : "Copy"}
          </Button>
        ) : null}
      </div>
      <div className="p-3 text-xs">
        <UiJsonViewer data={value as JsonValue} collapsed={collapsedDepth} />
      </div>
    </div>
  )
}
