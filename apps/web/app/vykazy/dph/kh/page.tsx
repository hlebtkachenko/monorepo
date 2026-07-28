import Link from "next/link"

import { DphModule } from "../_components/dph-module"

export default function DphKhPage() {
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
          Kontrolní hlášení (DPHKH1)
        </h1>
        <p className="text-sm text-muted-foreground">
          Právnická osoba podává kontrolní hlášení vždy měsíčně, i když je
          čtvrtletním plátcem DPH (§ 101e odst. 1 ZDPH).
        </p>
      </div>
      <DphModule kind="kh" />
    </main>
  )
}
