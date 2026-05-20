import Link from "next/link"

import { listContent } from "@/lib/content"

export const dynamic = "force-static"

export default function AccountingIndex() {
  const pages = listContent("accounting")
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Accounting</h1>
        <p className="text-muted-foreground">
          Czech-specific concepts and conventions. Drill into any topic.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {pages.map((p) => (
          <Link
            key={p.slug}
            href={`/accounting/${p.slug}`}
            className="rounded-lg border border-border bg-card p-5 transition hover:border-foreground/30"
          >
            <h2 className="text-base font-semibold">{p.frontmatter.title}</h2>
            {p.frontmatter.description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {p.frontmatter.description}
              </p>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  )
}
