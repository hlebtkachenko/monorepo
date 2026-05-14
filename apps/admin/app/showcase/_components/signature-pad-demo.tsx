"use client"

import { SignaturePad } from "@workspace/ui/components/signature-pad"

export function SignaturePadDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <label className="text-sm font-medium">Signature</label>
      <SignaturePad />
      <p className="text-xs text-muted-foreground">
        Draw your signature above. Click the reset icon to clear.
      </p>
    </div>
  )
}
