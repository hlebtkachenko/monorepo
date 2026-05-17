import type { Metadata } from "next"
import { ForgotPasswordForm } from "./forgot-password-form"

export const metadata: Metadata = {
  title: "Reset password — Admin",
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
