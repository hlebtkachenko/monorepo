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
        <h1 className="text-2xl font-semibold">{title}</h1>
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
