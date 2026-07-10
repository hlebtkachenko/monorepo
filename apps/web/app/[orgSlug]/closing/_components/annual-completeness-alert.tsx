import type { AnnualArtifactCompleteness } from "@workspace/accounting"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"

export function AnnualCompletenessAlert({
  completeness,
}: {
  completeness: AnnualArtifactCompleteness
}) {
  return (
    <Alert
      variant={
        completeness.status === "NEEDS_INPUT" ? "destructive" : "default"
      }
    >
      <AlertTitle>
        {completeness.status === "NEEDS_INPUT"
          ? "Inputs required"
          : completeness.status === "DRAFT"
            ? "Draft worksheet"
            : "Calculation worksheet ready"}
      </AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-4">
          {[
            ...completeness.blockingInputs,
            ...completeness.unsupportedRequirements,
          ].map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
