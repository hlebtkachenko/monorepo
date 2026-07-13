import { InputsDebug } from "@workspace/ui/blocks/inputs-debug"

export const metadata = { title: "Input Fields · Debug" }

/**
 * The shared inputs debug board (packages/ui/src/blocks/inputs-debug) rendered
 * inside the admin content panel. Same board the web dev route uses.
 */
export default function InputFieldsDebugPage() {
  return <InputsDebug />
}
