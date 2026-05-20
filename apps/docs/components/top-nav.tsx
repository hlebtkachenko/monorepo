import Link from "next/link"

const TABS = [
  { href: "/developers", label: "Developers" },
  { href: "/reference", label: "Reference" },
  { href: "/client", label: "API Client" },
  { href: "/accounting", label: "Accounting" },
  { href: "/app", label: "App" },
  { href: "/help", label: "Help" },
  { href: "/changelog", label: "Changelog" },
] as const

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-6">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Afframe
        </Link>
        <nav className="flex flex-1 items-center gap-1 text-sm">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-md px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <kbd className="hidden items-center gap-1 rounded border border-border bg-muted px-2 py-1 text-xs text-muted-foreground md:flex">
          <span>⌘</span>K
        </kbd>
      </div>
    </header>
  )
}
