import { Heading } from "@workspace/ui/components/heading"

interface SectionStubProps {
  title: string
  orgSlug: string
  /** Trailing URL path after orgSlug, e.g. "accounting/ledger". */
  subpath?: string
  description?: string
}

export function SectionStub({
  title,
  orgSlug,
  subpath,
  description,
}: SectionStubProps) {
  const path = subpath ?? title.toLowerCase()
  return (
    <div className="mx-auto max-w-6xl space-y-3 px-6 py-10">
      <header className="space-y-1">
        <Heading level={2} className="mt-0">
          {title}
        </Heading>
        <p className="text-sm text-muted-foreground">
          /{orgSlug}/{path}
        </p>
      </header>
      <p className="text-sm text-muted-foreground">
        {description ?? `${title}: content lands here.`}
      </p>
    </div>
  )
}
