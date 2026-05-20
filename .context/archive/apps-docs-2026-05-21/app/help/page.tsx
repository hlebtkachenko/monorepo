import Link from "next/link"

import { listContent } from "@/lib/content"

export const dynamic = "force-static"

export default function HelpIndex() {
  const pages = listContent("help")
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Help Center</h1>
        <p className="text-muted-foreground">
          End-user support. Articles below; reach the team at{" "}
          <Link href="/help/contact" className="underline">
            /help/contact
          </Link>
          .
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {pages.map((p) => (
          <Link
            key={p.slug}
            href={`/help/${p.slug}`}
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
