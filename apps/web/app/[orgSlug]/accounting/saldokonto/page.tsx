import { SaldokontoBody } from "../../../_components/saldokonto/saldokonto-body"
import { SaldokontoHeader } from "../../../_components/saldokonto/saldokonto-header"
import { SaldokontoProvider } from "../../../_components/saldokonto/context"
import { OrgPageHeader } from "../../../_components/org-page-header"

export const metadata = { title: "Saldokonto" }

/**
 * Saldokonto — open receivables/payables (open items). Table archetype; fills
 * the `accounting › Books › Saldokonto` nav slot. Fixture-backed
 * (saldokonto/data.ts TODO) until wired to `GET /v1/accounting/open-items`.
 */
export default function SaldokontoPage() {
  return (
    <SaldokontoProvider>
      <OrgPageHeader>
        <SaldokontoHeader />
      </OrgPageHeader>
      <SaldokontoBody />
    </SaldokontoProvider>
  )
}
