import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"

export const metadata = { title: "SQL console" }

export default function Page() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Heading level={1}>SQL console</Heading>
      <Text variant="muted">
        Stub page. Backed by a real table or feature in a later milestone.
      </Text>
    </div>
  )
}
