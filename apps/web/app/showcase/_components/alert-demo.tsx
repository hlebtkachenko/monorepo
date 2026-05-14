"use client"

import { AlertCircleIcon, InfoIcon, XIcon } from "lucide-react"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

export function AlertDemo() {
  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <InfoIcon />
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>
          Your subscription renews in 3 days. Update your payment method if
          needed.
        </AlertDescription>
      </Alert>

      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Deployment failed</AlertTitle>
        <AlertDescription>
          Build error on step 4. Check the logs for details and retry.
        </AlertDescription>
      </Alert>

      <Alert>
        <InfoIcon />
        <AlertTitle>Update available</AlertTitle>
        <AlertDescription>A new version is ready to install.</AlertDescription>
        <AlertAction>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline">
              Update
            </Button>
            <Button size="icon" variant="ghost" aria-label="Dismiss alert">
              <XIcon />
            </Button>
          </div>
        </AlertAction>
      </Alert>
    </div>
  )
}
