import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

interface ShellSkeletonProps {
  className?: string
}

/**
 * Placeholder loading state for the org / workspace / admin shell. Mirrors
 * the real shell geometry — a left rail column, a top header bar, and a
 * sidebar + content body — so it reads as the shell warming up instead of a
 * single gray slab that geometry-clashes with the painted chrome around it.
 * Uses the same `--shell-*` dimension tokens + `bg-canvas` the AppShell does.
 */
export function ShellSkeleton({ className }: ShellSkeletonProps) {
  return (
    <div
      data-slot="app-shell-skeleton"
      className={cn("flex h-svh w-full gap-3 bg-canvas p-3", className)}
    >
      {/* Left rail — hidden below md, where the real shell hides it too. */}
      <Skeleton className="hidden w-[var(--shell-rail-width)] shrink-0 rounded-md md:block" />
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* Header bar. */}
        <Skeleton className="h-[var(--shell-header-height)] w-full shrink-0 rounded-md" />
        {/* Body region: sidebar + content card. */}
        <div className="flex min-h-0 flex-1 gap-3">
          <Skeleton className="hidden w-56 shrink-0 rounded-md md:block" />
          <Skeleton className="min-w-0 flex-1 rounded-md" />
        </div>
      </div>
    </div>
  )
}
