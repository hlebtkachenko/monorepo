import Link from "next/link"
import { Code2, HelpCircle, Calculator } from "lucide-react"

const AUDIENCES = [
  {
    href: "/developers",
    title: "Developers",
    blurb:
      "Build on the public REST API. Quickstart, authentication, SDK, CLI, MCP, webhooks, recipes.",
    icon: Code2,
  },
  {
    href: "/accounting",
    title: "Accountants",
    blurb:
      "Czech double-entry, VAT, DIČ / IČO validation, ISDOC, FX, fiscal periods, year-end close.",
    icon: Calculator,
  },
  {
    href: "/help",
    title: "Support",
    blurb:
      "Getting started, FAQ, billing, data import / export, troubleshooting, contact.",
    icon: HelpCircle,
  },
] as const

export default function HomePage() {
  return (
    <section className="flex flex-col gap-12 py-10">
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Afframe Developer Hub
        </h1>
        <p className="mx-auto max-w-2xl text-balance text-muted-foreground">
          Self-hosted accounting platform for Czech regulated workflows.
          Stripe-shape REST, Plaid-shape errors, IETF RateLimit headers,
          first-class SDK / CLI / MCP.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {AUDIENCES.map(({ href, title, blurb, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-6 transition hover:border-foreground/30 hover:shadow-md"
          >
            <Icon className="size-6 text-muted-foreground group-hover:text-foreground" />
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{blurb}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
