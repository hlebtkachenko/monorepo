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
  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>
        {completeness.status === "NEEDS_INPUT"
          ? "VAT evidence needs input"
          : "Partial VAT worksheet"}
      </AlertTitle>
      <AlertDescription>
        {completeness.status === "NEEDS_INPUT" ? (
          <p>
            Missing tax-point dates: {completeness.missingTaxPointDocuments}.
            Missing received-document dates:{" "}
            {completeness.missingReceivedDateDocuments}. Amounts that depend on
            missing evidence are excluded until it is supplied. Documents with
            missing VAT classification or counterparty identity:{" "}
            {completeness.missingClassificationDocuments}.
          </p>
        ) : null}
        <ul className="list-disc pl-5">
          {completeness.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
