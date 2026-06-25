"use client"

import { useState } from "react"
import { Terminal } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

export interface CopyAsCurlProps {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  url: string
  headers?: Record<string, string>
  body?: unknown
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}

function buildCurl(props: CopyAsCurlProps): string {
  const parts: string[] = ["curl", "-X", props.method, shellQuote(props.url)]
  for (const [k, v] of Object.entries(props.headers ?? {})) {
    parts.push("-H", shellQuote(`${k}: ${v}`))
  }
  if (props.body !== undefined) {
    parts.push("-d", shellQuote(JSON.stringify(props.body)))
  }
  return parts.join(" ")
}

export function CopyAsCurl(props: CopyAsCurlProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildCurl(props))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void handleCopy()}
    >
      <Terminal className="size-3" aria-hidden />
      {copied ? "Copied" : "Copy as cURL"}
    </Button>
  )
}
