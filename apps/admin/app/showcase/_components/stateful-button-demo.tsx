"use client"

import { Button } from "@workspace/ui/components/button"
import { useStatefulButton } from "@workspace/ui/hooks/use-stateful-button"
import { Loader2, Check, X } from "lucide-react"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function StatefulButtonDemo() {
  const success = useStatefulButton({
    onAction: () => sleep(1500),
  })

  const error = useStatefulButton({
    onAction: async () => {
      await sleep(1000)
      throw new Error("Failed")
    },
  })

  return (
    <div className="flex flex-wrap gap-4">
      <Button onClick={success.handleClick} disabled={success.isLoading}>
        {success.isLoading && <Loader2 className="size-4 animate-spin" />}
        {success.isSuccess && <Check className="size-4" />}
        {success.isLoading
          ? "Saving..."
          : success.isSuccess
            ? "Saved"
            : "Save Changes"}
      </Button>
      <Button
        variant="destructive"
        onClick={error.handleClick}
        disabled={error.isLoading}
      >
        {error.isLoading && <Loader2 className="size-4 animate-spin" />}
        {error.isError && <X className="size-4" />}
        {error.isLoading ? "Deleting..." : error.isError ? "Failed" : "Delete"}
      </Button>
    </div>
  )
}
