import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

export type ErrorShellVariant = "error" | "404" | "forbidden"

interface ErrorShellProps {
  variant?: ErrorShellVariant
  title?: string
  description?: string
  /** Shown when present. Optional client-side `reset()` callback from
   *  Next's `error.tsx`. */
  onReset?: () => void
  /** Optional href for a "back to safety" CTA. */
  homeHref?: string
  homeLabel?: string
  /** Optional error digest / id surfaced for support. */
  errorId?: string
  className?: string
}

const DEFAULTS: Record<
  ErrorShellVariant,
  { title: string; description: string }
> = {
  error: {
    title: "Something went wrong",
    description: "We hit an unexpected error. Try again, or head home.",
  },
  "404": {
    title: "Page not found",
    description: "The page you’re looking for doesn’t exist or has moved.",
  },
  forbidden: {
    title: "Access denied",
    description: "You don’t have permission to view this page.",
  },
}

/**
 * Error / 404 / forbidden page surface. Server-safe — the `onReset`
 * button is only rendered when a callback is supplied (callers from
 * `error.tsx` are already client components). Uses a plain `<a>` for
 * the home link to avoid coupling the block to Next's router.
 */
export function ErrorShell({
  variant = "error",
  title,
  description,
  onReset,
  homeHref = "/",
  homeLabel = "Go home",
  errorId,
  className,
}: ErrorShellProps) {
  const d = DEFAULTS[variant]
  return (
    <div
      data-slot="app-shell-error"
      data-variant={variant}
      className={cn(
        "mx-auto flex w-full max-w-md flex-col items-start gap-4 px-6 py-16",
        className,
      )}
    >
      <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
        {variant === "404" ? "404" : variant === "forbidden" ? "403" : "Error"}
      </p>
      <h1 className="font-heading text-2xl font-semibold">
        {title ?? d.title}
      </h1>
      <p className="text-sm text-muted-foreground">
        {description ?? d.description}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {onReset && (
          <Button size="sm" onClick={onReset}>
            Try again
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <a href={homeHref}>{homeLabel}</a>
        </Button>
      </div>
      {errorId && (
        <p className="font-mono text-xs text-muted-foreground">
          ref: {errorId}
        </p>
      )}
    </div>
  )
}
