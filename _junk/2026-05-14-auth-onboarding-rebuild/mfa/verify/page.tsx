import { Suspense } from "react"
import { MfaVerifyForm } from "./mfa-verify-form"

export const metadata = {
  title: "Two-factor verification",
}

export default function MfaVerifyPage() {
  return (
    <Suspense fallback={null}>
      <MfaVerifyForm />
    </Suspense>
  )
}
