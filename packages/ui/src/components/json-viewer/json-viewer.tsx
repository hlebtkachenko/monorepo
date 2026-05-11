"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

interface JsonViewerProps {
  data: JsonValue
  collapsed?: boolean | number
  searchable?: boolean
  copyPath?: boolean
  maxDepth?: number
  className?: string
}

interface JsonNodeProps {
  keyName?: string
  value: JsonValue
  depth: number
  path: string
  defaultCollapsed: boolean | number
  maxDepth: number
  copyPath: boolean
  searchQuery: string
}

function getValueType(
  value: JsonValue,
): "string" | "number" | "boolean" | "null" | "array" | "object" {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value === "string") return "string"
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "boolean"
  return "object"
}

function getPreview(value: JsonValue): string {
  if (Array.isArray(value)) return `Array(${value.length})`
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value)
    const preview = keys.slice(0, 3).join(", ")
    return `{${preview}${keys.length > 3 ? "..." : ""}}`
  }
  return String(value)
}

function matchesSearch(value: JsonValue, query: string): boolean {
  if (!query) return true
  const lowerQuery = query.toLowerCase()

  if (typeof value === "string") return value.toLowerCase().includes(lowerQuery)
  if (typeof value === "number") return String(value).includes(lowerQuery)
  if (typeof value === "boolean") return String(value).includes(lowerQuery)
  if (value === null) return "null".includes(lowerQuery)
  if (Array.isArray(value)) return value.some((v) => matchesSearch(v, query))
  if (typeof value === "object") {
    return Object.entries(value).some(
      ([k, v]) =>
        k.toLowerCase().includes(lowerQuery) || matchesSearch(v, query),
    )
  }
  return false
}

function ScalarValue({
  value,
  type,
}: {
  value: JsonValue
  type: ReturnType<typeof getValueType>
}) {
  if (type === "null") {
    return <span className="text-muted-foreground italic">null</span>
  }
  if (type === "boolean") {
    return <span style={{ color: "var(--chart-3)" }}>{String(value)}</span>
  }
  if (type === "number") {
    return <span style={{ color: "var(--chart-2)" }}>{String(value)}</span>
  }
  if (type === "string") {
    const str = value as string
    const display = str.length > 500 ? str.slice(0, 500) + "..." : str
    return (
      <span style={{ color: "var(--chart-1)" }}>&quot;{display}&quot;</span>
    )
  }
  return null
}

function JsonNode({
  keyName,
  value,
  depth,
  path,
  defaultCollapsed,
  maxDepth,
  copyPath,
  searchQuery,
}: JsonNodeProps) {
  const shouldDefaultCollapse =
    typeof defaultCollapsed === "number"
      ? depth >= defaultCollapsed
      : defaultCollapsed

  const [isCollapsed, setIsCollapsed] = React.useState(shouldDefaultCollapse)
  const [copied, setCopied] = React.useState(false)

  const type = getValueType(value)
  const isExpandable = type === "object" || type === "array"
  const isVisible =
    matchesSearch(value, searchQuery) ||
    (keyName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)

  React.useEffect(() => {
    if (searchQuery && isExpandable && matchesSearch(value, searchQuery)) {
      setIsCollapsed(false)
    }
  }, [searchQuery, isExpandable, value])

  const handleToggle = React.useCallback(() => {
    setIsCollapsed((prev) => !prev)
  }, [])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        handleToggle()
      } else if (e.key === "ArrowRight" && isCollapsed) {
        e.preventDefault()
        setIsCollapsed(false)
      } else if (e.key === "ArrowLeft" && !isCollapsed) {
        e.preventDefault()
        setIsCollapsed(true)
      }
    },
    [handleToggle, isCollapsed],
  )

  const handleCopyPath = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }, [path])

  if (!isVisible && searchQuery) return null

  if (!isExpandable) {
    return (
      <div className="group flex items-center gap-1 py-0.5" role="treeitem">
        {keyName !== undefined && (
          <>
            <span className="text-foreground">{keyName}</span>
            <span className="text-muted-foreground">:</span>
          </>
        )}
        <ScalarValue value={value} type={type} />
        {copyPath && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopyPath}
            aria-label={`Copy path ${path}`}
            className="ml-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
          >
            {copied ? "OK" : "Copy"}
          </Button>
        )}
      </div>
    )
  }

  if (depth >= maxDepth) {
    return (
      <div className="flex items-center gap-1 py-0.5">
        {keyName !== undefined && (
          <>
            <span className="text-foreground">{keyName}</span>
            <span className="text-muted-foreground">:</span>
          </>
        )}
        <span className="text-muted-foreground italic">
          {getPreview(value)}
        </span>
      </div>
    )
  }

  const entries =
    type === "array"
      ? (value as JsonValue[]).map(
          (v, i) => [String(i), v] as [string, JsonValue],
        )
      : Object.entries(value as Record<string, JsonValue>)

  const brackets =
    type === "array" ? (["[", "]"] as const) : (["{", "}"] as const)

  return (
    <div className="py-0.5" role="treeitem" aria-expanded={!isCollapsed}>
      <div className="group flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          aria-label={isCollapsed ? "Expand" : "Collapse"}
          className="text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? "+" : "-"}
        </Button>
        {keyName !== undefined && (
          <>
            <span className="text-foreground">{keyName}</span>
            <span className="text-muted-foreground">:</span>
          </>
        )}
        <span className="text-muted-foreground">
          {brackets[0]}
          {isCollapsed && (
            <>
              <span className="mx-1 text-xs italic">{getPreview(value)}</span>
              {brackets[1]}
            </>
          )}
        </span>
        {copyPath && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopyPath}
            aria-label={`Copy path ${path}`}
            className="ml-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
          >
            {copied ? "OK" : "Copy"}
          </Button>
        )}
      </div>
      {!isCollapsed && (
        <div className="ml-4 border-l border-border pl-2" role="group">
          {entries.map(([k, v]) => (
            <JsonNode
              key={k}
              keyName={k}
              value={v}
              depth={depth + 1}
              path={type === "array" ? `${path}[${k}]` : `${path}.${k}`}
              defaultCollapsed={defaultCollapsed}
              maxDepth={maxDepth}
              copyPath={copyPath}
              searchQuery={searchQuery}
            />
          ))}
          <div className="text-muted-foreground">{brackets[1]}</div>
        </div>
      )}
    </div>
  )
}

function JsonViewer({
  data,
  collapsed = false,
  searchable = false,
  copyPath = true,
  maxDepth = 10,
  className,
}: JsonViewerProps) {
  const [searchQuery, setSearchQuery] = React.useState("")

  return (
    <div
      data-slot="json-viewer"
      role="tree"
      aria-label="JSON data"
      className={cn("font-mono text-sm", className)}
    >
      {searchable && (
        <div className="mb-2">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            aria-label="Search JSON"
          />
        </div>
      )}
      <div className="overflow-auto">
        <JsonNode
          value={data}
          depth={0}
          path="$"
          defaultCollapsed={collapsed}
          maxDepth={maxDepth}
          copyPath={copyPath}
          searchQuery={searchQuery}
        />
      </div>
    </div>
  )
}

export { JsonViewer }
export type { JsonViewerProps, JsonValue }
