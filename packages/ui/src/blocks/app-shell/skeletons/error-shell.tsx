import { UtilityPage } from "@workspace/ui/blocks/utility-page"

export type ErrorShellVariant = "error" | "404" | "forbidden"

interface ErrorShellProps {
  variant?: ErrorShellVariant
  onReset?: () => void
  homeHref?: string
  errorId?: string
  className?: string
}

const STATE_BY_VARIANT = {
  error: "unexpected_server_error",
  "404": "route_not_found",
  forbidden: "access_denied",
} as const

/**
 * Compatibility adapter for existing app-shell consumers. New routes should
 * select a catalog state directly through `UtilityPage`.
 */
export function ErrorShell({
  variant = "error",
  onReset,
  homeHref = "/",
  errorId,
  className,
}: ErrorShellProps) {
  return (
    <UtilityPage
      state={STATE_BY_VARIANT[variant]}
      runtime={{
        surface: "shell",
        fallbackChrome: true,
        onRetry: onReset,
        referenceId: errorId,
        actionHrefs: { go_back: homeHref },
      }}
      className={className}
    />
  )
}
