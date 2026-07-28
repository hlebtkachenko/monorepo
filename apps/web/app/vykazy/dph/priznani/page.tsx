import Link from "next/link"

import { DphModule } from "../_components/dph-module"

export default function DphPriznaniPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <Link
          href="/vykazy/dph"
          className="text-sm text-primary hover:underline"
        >
          ← Daň z přidané hodnoty
        </Link>
        <h1 className="mt-2 text-xl font-bold text-foreground">
          Přiznání k DPH (DPHDP3)
        </h1>
        <p className="text-sm text-muted-foreground">
          Vytvoří XML pro elektronické podání na daňovém portálu. Řádky 62 až 65
          dopočítá výpočetní jádro podle schématu, ručně se nezadávají.
        </p>
      </div>
      <DphModule kind="priznani" />
    </main>
  )
}
