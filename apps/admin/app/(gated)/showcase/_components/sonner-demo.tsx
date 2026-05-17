"use client"

import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"

export function SonnerDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="outline"
        onClick={() => toast("Project saved successfully.")}
      >
        Default toast
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.success("Deployment complete.", {
            description: "Your app is now live.",
          })
        }
      >
        Success
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.error("Build failed.", {
            description: "Check logs for details.",
          })
        }
      >
        Error
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.warning("Quota almost reached.", {
            description: "80% of your monthly limit used.",
          })
        }
      >
        Warning
      </Button>
    </div>
  )
}
