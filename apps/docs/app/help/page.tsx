import Link from "next/link"

const SECTIONS = [
  { href: "/help/getting-started", title: "Getting started" },
  { href: "/help/faq", title: "FAQ" },
  { href: "/help/billing", title: "Billing" },
  { href: "/help/data", title: "Data import / export" },
  { href: "/help/troubleshooting", title: "Troubleshooting" },
  { href: "/help/contact", title: "Contact support" },
  { href: "/help/terms", title: "Terms of service" },
] as const

export default function HelpIndex() {
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Help Center</h1>
        <p className="text-muted-foreground">
          End-user support. Topics ship as MDX in Phase C3.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-border bg-card p-5 transition hover:border-foreground/30"
          >
            <h2 className="text-base font-semibold">{s.title}</h2>
          </Link>
        ))}
      </div>
    </section>
  )
}
