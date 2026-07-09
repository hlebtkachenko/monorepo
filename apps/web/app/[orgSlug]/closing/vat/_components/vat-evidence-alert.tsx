import type { VatEvidenceCompleteness } from "@workspace/accounting"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { AlertTriangle } from "@workspace/ui/lib/icons"

export function VatEvidenceAlert({
  completeness,
}: {
  completeness: VatEvidenceCompleteness
}) {
  if (completeness.status !== "NEEDS_INPUT") return null

  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>VAT evidence incomplete</AlertTitle>
      <AlertDescription>
        Missing tax-point dates: {completeness.missingTaxPointDocuments}.
        Missing received-document dates:{" "}
        {completeness.missingReceivedDateDocuments}. Amounts that depend on
        missing evidence are excluded until it is supplied.
      </AlertDescription>
    </Alert>
  )
}
