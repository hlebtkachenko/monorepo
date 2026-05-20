import Link from "next/link"

import { AskAI } from "@/components/ask-ai"

const SECTIONS = [
  {
    href: "/developers/quickstart",
    title: "Quickstart",
    blurb: "Send your first request in 60 seconds.",
  },
  {
    href: "/developers/authentication",
    title: "Authentication",
    blurb: "API keys, scopes, environments.",
  },
  {
    href: "/developers/errors",
    title: "Errors",
    blurb: "Plaid-shape envelope, every code documented.",
  },
  {
    href: "/developers/rate-limits",
    title: "Rate limits",
    blurb: "IETF `RateLimit-*` headers, retry conventions.",
  },
  {
    href: "/developers/idempotency",
    title: "Idempotency",
    blurb: "Safe retries for mutations.",
  },
  {
    href: "/developers/webhooks",
    title: "Webhooks",
    blurb: "Standard Webhooks v1 signature verification.",
  },
  {
    href: "/developers/sdks",
    title: "SDKs",
    blurb: "TypeScript SDK, generated from the OpenAPI spec.",
  },
  {
    href: "/developers/cli",
    title: "CLI",
    blurb: "`@afframe/cli`: invoke any endpoint from the shell.",
  },
  {
    href: "/developers/mcp",
    title: "MCP",
    blurb: "Expose every endpoint as a tool to Claude, Cursor, others.",
  },
  {
    href: "/reference",
    title: "API Reference",
    blurb: "Full OpenAPI 3.1 reference.",
  },
] as const

export default function DevelopersIndex() {
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Developers</h1>
        <p className="text-muted-foreground">
          Build on the Afframe public API.
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
            <p className="mt-1 text-sm text-muted-foreground">{s.blurb}</p>
          </Link>
        ))}
      </div>
      <AskAI />
    </section>
  )
}
