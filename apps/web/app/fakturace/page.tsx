// Landing page for /fakturace: a single scrollable, sectioned invoice editor.
// Every part is its own visually-bounded <section> (supplier / customer /
// services / output) and its own component file. FakturaceProvider lives in the
// segment layout, so all sections share one document state.

import { Customer } from "./_components/customer"
import { Output } from "./_components/output"
import { SectionNav } from "./_components/section-nav"
import { Services } from "./_components/services"
import { Supplier } from "./_components/supplier"
import { Toolbar } from "./_components/toolbar"
import { TotalsBar } from "./_components/totals-bar"

export default function FakturacePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6 pb-16">
      <div className="no-print">
        <h1 className="text-xl font-bold text-black">Fakturace</h1>
        <p className="text-sm text-neutral-600">
          Fakturace klientovi za účetní práci. Vyplňte strany a služby, stáhněte
          fakturu (ISDOC / PDF) a výkaz práce (XML / PDF). Vše běží ve vašem
          prohlížeči; stav uložíte do lokálního XML souboru.
        </p>
      </div>

      <Toolbar />
      <SectionNav />

      <Supplier />
      <Customer />
      <Services />
      <Output />

      <TotalsBar />
    </main>
  )
}
