import Link from "next/link"

import { DppoForm } from "./_components/dppo-form"

// /vykazy/dppo: generate a DPPO (Přiznání k dani z příjmů právnických osob,
// DPPDP9) EPO XML from the built statements + manual daňové úpravy. Standalone,
// login-free; shares the OrgProvider from the segment layout with the other
// /vykazy pages. For a právnická osoba only.

export default function DppoPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <Link href="/vykazy" className="text-sm text-blue-600 hover:underline">
          ← Účetní výkazy
        </Link>
        <h1 className="mt-2 text-xl font-bold text-black">
          Přiznání k dani z příjmů právnických osob (DPPO)
        </h1>
        <p className="text-sm text-neutral-600">
          Vytvoří XML pro elektronické podání (EPO) z účetního výsledku a
          daňových úprav. Pouze pro právnickou osobu.
        </p>
      </div>

      <DppoForm />
    </main>
  )
}
