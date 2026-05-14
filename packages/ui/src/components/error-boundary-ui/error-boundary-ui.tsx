"use client"

import * as React from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
} from "@workspace/ui/lib/icons"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

interface ErrorBoundaryUiProps {
  error: Error
  resetError?: () => void
  componentStack?: string | null
  isDev?: boolean
  className?: string
}

interface StackFrame {
  fn: string
  file: string
  line: string
  column: string
}

function parseStackTrace(stack: string): StackFrame[] {
  const lines = stack.split("\n").slice(1)
  return lines
    .map<StackFrame | null>((line) => {
      const namedMatch = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/)
      if (namedMatch) {
        return {
          fn: namedMatch[1]!,
          file: namedMatch[2]!,
          line: namedMatch[3]!,
          column: namedMatch[4]!,
        }
      }
      const anonMatch = line.match(/at\s+(.+?):(\d+):(\d+)/)
      if (anonMatch) {
        return {
          fn: "anonymous",
          file: anonMatch[1]!,
          line: anonMatch[2]!,
          column: anonMatch[3]!,
        }
      }
      return null
    })
    .filter((x): x is StackFrame => x !== null)
}

function ErrorBoundaryUi({
  error,
  resetError,
  componentStack,
  isDev = process.env.NODE_ENV === "development",
  className,
}: ErrorBoundaryUiProps) {
  const [showStack, setShowStack] = React.useState(isDev)
  const [showComponentStack, setShowComponentStack] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const copiedTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const stackFrames = React.useMemo(
    () => (error.stack ? parseStackTrace(error.stack) : []),
    [error.stack],
  )

  React.useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        clearTimeout(copiedTimeoutRef.current)
        copiedTimeoutRef.current = null
      }
    }
  }, [])

  const handleCopy = React.useCallback(async () => {
    const parts = [
      `Error: ${error.message}`,
      "",
      "Stack Trace:",
      error.stack ?? "",
    ]
    if (componentStack) {
      parts.push("", "Component Stack:", componentStack)
    }
    try {
      await navigator.clipboard.writeText(parts.join("\n"))
      setCopied(true)
      if (copiedTimeoutRef.current !== null) {
        clearTimeout(copiedTimeoutRef.current)
      }
      copiedTimeoutRef.current = setTimeout(() => {
        copiedTimeoutRef.current = null
        setCopied(false)
      }, 1500)
    } catch {
      // clipboard unavailable
    }
  }, [error.message, error.stack, componentStack])

  return (
    <div
      data-slot="error-boundary-ui"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={cn(
        "overflow-hidden rounded-lg border border-destructive/30 bg-destructive/5",
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 shrink-0">
          <AlertTriangle className="size-5 text-destructive" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-destructive">
            {isDev ? error.name || "Error" : "Something went wrong"}
          </h3>
          <p className="mt-1 text-sm break-words text-destructive/90">
            {isDev
              ? error.message
              : "An unexpected error occurred. Please try again."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pb-4">
        {resetError && (
          <Button
            variant="destructive"
            size="sm"
            onClick={resetError}
            aria-label="Try again"
          >
            <RefreshCw />
            Try again
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          aria-label={copied ? "Copied to clipboard" : "Copy error details"}
        >
          <Copy />
          {copied ? "Copied" : "Copy error"}
        </Button>
      </div>

      {isDev && error.stack && (
        <div className="border-t border-destructive/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowStack((prev) => !prev)}
            aria-expanded={showStack}
            aria-controls="error-stack-trace"
            aria-label="Toggle stack trace"
            className="w-full justify-between rounded-none px-4 py-2 text-destructive"
          >
            <span className="font-medium">Stack Trace</span>
            {showStack ? <ChevronUp /> : <ChevronDown />}
          </Button>
          {showStack && (
            <div
              id="error-stack-trace"
              className="overflow-auto px-4 pb-4"
              aria-label="Error stack trace"
            >
              <div className="space-y-1 font-mono text-xs">
                {stackFrames.map((frame, idx) => (
                  <div key={idx} className="flex gap-2 text-destructive">
                    <span className="shrink-0 text-destructive/60">at</span>
                    <span className="text-destructive">{frame.fn}</span>
                    <span className="truncate text-destructive/80">
                      ({frame.file}:{frame.line}:{frame.column})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isDev && componentStack && (
        <div className="border-t border-destructive/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowComponentStack((prev) => !prev)}
            aria-expanded={showComponentStack}
            aria-controls="error-component-stack"
            aria-label="Toggle component stack"
            className="w-full justify-between rounded-none px-4 py-2 text-destructive"
          >
            <span className="font-medium">Component Stack</span>
            {showComponentStack ? <ChevronUp /> : <ChevronDown />}
          </Button>
          {showComponentStack && (
            <div
              id="error-component-stack"
              className="overflow-auto px-4 pb-4"
              aria-label="Component stack trace"
            >
              <pre className="font-mono text-xs whitespace-pre-wrap text-destructive">
                {componentStack}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { ErrorBoundaryUi }
export type { ErrorBoundaryUiProps }
