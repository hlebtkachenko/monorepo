import Link from "next/link"

import { OrgForm } from "./_components/org-form"
import { Toolbar } from "./_components/toolbar"

// Landing page for /vykazy: identification form + toolbar + links to the two
// statements. OrgProvider lives in the segment layout, so this shares its state.

export default function VykazyPage() {
  return (
    <main className="vykaz-page mx-auto max-w-5xl space-y-4 p-6">
      <div className="no-print">
        <h1 className="text-xl font-bold text-foreground">Účetní výkazy</h1>
        <p className="text-sm text-muted-foreground">
          Vyplňte identifikaci a hodnoty, vytiskněte jako PDF v podobě úředního
          formuláře.
        </p>
      </div>

      <Toolbar />
      <OrgForm />

      <nav className="no-print grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/vykazy/denik"
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-accent sm:col-span-2"
        >
          <span className="block text-base font-semibold text-foreground">
            Účetní deník
          </span>
          <span className="block text-sm text-muted-foreground">
            Editovatelný deník s obratovou předvahou jako filtrem
          </span>
        </Link>
        <Link
          href="/vykazy/rozvaha"
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
        >
          <span className="block text-base font-semibold text-foreground">
            Rozvaha
          </span>
          <span className="block text-sm text-muted-foreground">
            Aktiva a pasiva
          </span>
        </Link>
        <Link
          href="/vykazy/vzz"
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
        >
          <span className="block text-base font-semibold text-foreground">
            Výkaz zisku a ztráty
          </span>
          <span className="block text-sm text-muted-foreground">
            Výsledovka (druhové členění)
          </span>
        </Link>
        <Link
          href="/vykazy/predvaha"
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
        >
          <span className="block text-base font-semibold text-foreground">
            Obratová předvaha
          </span>
          <span className="block text-sm text-muted-foreground">
            Počáteční stav, obrat a konečný stav po účtech (z deníku) — PDF /
            CSV
          </span>
        </Link>
        <Link
          href="/vykazy/dppo"
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
        >
          <span className="block text-base font-semibold text-foreground">
            Přiznání k dani z příjmů (DPPO)
          </span>
          <span className="block text-sm text-muted-foreground">
            XML pro EPO z účetního výsledku a daňových úprav
          </span>
        </Link>
      </nav>
    </main>
  )
}
