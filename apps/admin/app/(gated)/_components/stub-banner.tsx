import type { ReactNode } from "react"
import { Construction } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"

interface StubBannerProps {
  children?: ReactNode
  nextStep?: string
}

export function StubBanner({ children, nextStep }: StubBannerProps) {
  return (
    <Alert className="border-amber-500/40 bg-amber-500/5">
      <Construction className="size-4" aria-hidden />
      <AlertTitle>Stub page</AlertTitle>
      <AlertDescription>
        {children ? <span>{children}</span> : null}
        {nextStep ? <span className="block">{nextStep}</span> : null}
      </AlertDescription>
    </Alert>
  )
}
