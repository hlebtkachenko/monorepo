import type { ProfileIssue } from "@workspace/accounting/obligations"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { AlertTriangle } from "@workspace/ui/lib/icons"

import { formatIsoDate } from "../_lib/closing-shared"

export function ProfileIssuesAlert({ issues }: { issues: ProfileIssue[] }) {
  if (issues.length === 0) return null

  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>Configuration needed</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-4">
          {issues.map((issue) => (
            <li key={`${issue.code}-${issue.from}-${issue.to}`}>
              {issue.message} {formatIsoDate(issue.from)} to{" "}
              {formatIsoDate(issue.to)}.
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
