import { notFound } from "next/navigation"

import { InputsDebug } from "@workspace/ui/blocks/inputs-debug"

export const metadata = { title: "Dev · Inputs debug" }
export const dynamic = "force-dynamic"

export default function DevInputsPage() {
  // Dev-only showcase: never expose in a production build.
  if (process.env.NODE_ENV === "production") {
    notFound()
  }
  return <InputsDebug />
}
