import { Suspense } from "react"
import { MfaSetupForm } from "./mfa-setup-form"

export const metadata = {
  title: "Set up two-factor",
}

export default function MfaSetupPage() {
  return (
    <Suspense fallback={null}>
      <MfaSetupForm />
    </Suspense>
  )
}
