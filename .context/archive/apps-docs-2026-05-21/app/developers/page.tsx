import Link from "next/link"

import { AskAI } from "@/components/ask-ai"
import { listContent } from "@/lib/content"

export const dynamic = "force-static"

const EXTRA_LINKS = [
  {
    href: "/reference",
    title: "API Reference",
    blurb: "Full OpenAPI 3.1 reference.",
  },
] as const

export default function DevelopersIndex() {
  const pages = listContent("developers")
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Developers</h1>
        <p className="text-muted-foreground">
          Build on the Afframe public API.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {pages.map((p) => (
          <Link
            key={p.slug}
            href={`/developers/${p.slug}`}
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
        {EXTRA_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-border bg-card p-5 transition hover:border-foreground/30"
          >
            <h2 className="text-base font-semibold">{l.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{l.blurb}</p>
          </Link>
        ))}
      </div>
      <AskAI />
    </section>
  )
}
