import { cn } from "@workspace/ui/lib/utils"

/**
 * Lightweight narrative page wrapper. Replaces a full MDX pipeline for the
 * Phase C scaffold: each developer / accounting / help page authors its
 * content as TSX rendered through this layout. When the project adopts a
 * full MDX runtime (Pagefind-indexed, with `.md` mirrors), swap this for
 * an `<MDX />` component without touching consumer files.
 */
export function Doc({
  title,
  intro,
  children,
}: {
  title: string
  intro?: string
  children: React.ReactNode
}) {
  return (
    <article className="max-w-3xl">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {intro ? <p className="text-muted-foreground">{intro}</p> : null}
      </header>
      <div
        className={cn(
          "prose prose-neutral dark:prose-invert mt-8",
          "prose-headings:scroll-mt-24 prose-h2:mt-10 prose-h2:text-xl",
          "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5",
          "prose-pre:bg-muted prose-pre:rounded-lg",
        )}
      >
        {children}
      </div>
    </article>
  )
}
