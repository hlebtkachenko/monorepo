import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

interface ShellSkeletonProps {
  className?: string
}

/**
 * Placeholder loading state for the org / workspace / admin shell.
 * Currently a neutral full-height block — will be updated to mirror the
 * real shell geometry once that layout is designed and approved.
 */
export function ShellSkeleton({ className }: ShellSkeletonProps) {
  return (
    <div
      data-slot="app-shell-skeleton"
      className={cn("h-svh w-full p-6", className)}
    >
      <Skeleton className="h-full w-full" />
    </div>
  )
}
