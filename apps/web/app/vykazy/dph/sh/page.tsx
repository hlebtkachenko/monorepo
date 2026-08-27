import Link from "next/link"

import { DphModule } from "../_components/dph-module"

export default function DphShPage() {
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
          Souhrnné hlášení VIES (DPHSHV)
        </h1>
        <p className="text-sm text-muted-foreground">
          Do hlášení patří jen řádky s vyplněným kódem plnění. Čtvrtletní podání
          je možné pouze u samotných služeb podle § 9 odst. 1 (§ 102 odst. 6).
        </p>
      </div>
      <DphModule kind="sh" />
    </main>
  )
}
