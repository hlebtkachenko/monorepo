import Link from "next/link"

import { OrgForm } from "./_components/org-form"
import { Toolbar } from "./_components/toolbar"

// Landing page for /vykazy: identification form + toolbar + links to the two
// statements. OrgProvider lives in the segment layout, so this shares its state.

export default function VykazyPage() {
  return (
    <main className="vykaz-page mx-auto max-w-5xl space-y-4 p-6">
      <div className="no-print">
        <h1 className="text-xl font-bold text-black">Účetní výkazy</h1>
        <p className="text-sm text-neutral-600">
          Vyplňte identifikaci a hodnoty, vytiskněte jako PDF v podobě úředního
          formuláře.
        </p>
      </div>

      <Toolbar />
      <OrgForm />

      <nav className="no-print grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/vykazy/denik"
          className="rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-blue-400 hover:bg-blue-50 sm:col-span-2"
        >
          <span className="block text-base font-semibold text-black">
            Účetní deník
          </span>
          <span className="block text-sm text-neutral-600">
            Editovatelný deník s obratovou předvahou jako filtrem
          </span>
        </Link>
        <Link
          href="/vykazy/rozvaha"
          className="rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-blue-400 hover:bg-blue-50"
        >
          <span className="block text-base font-semibold text-black">
            Rozvaha
          </span>
          <span className="block text-sm text-neutral-600">
            Aktiva a pasiva
          </span>
        </Link>
        <Link
          href="/vykazy/vzz"
          className="rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-blue-400 hover:bg-blue-50"
        >
          <span className="block text-base font-semibold text-black">
            Výkaz zisku a ztráty
          </span>
          <span className="block text-sm text-neutral-600">
            Výsledovka (druhové členění)
          </span>
        </Link>
      </nav>
    </main>
  )
}
