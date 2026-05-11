import type { Meta, StoryObj } from "@storybook/react"
import { CardExtended } from "./card-extended"
import {
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

const meta: Meta<typeof CardExtended> = {
  title: "Components/CardExtended",
  component: CardExtended,
}
export default meta
type Story = StoryObj<typeof CardExtended>

function SampleContent() {
  return (
    <>
      <CardHeader>
        <CardTitle>
          <div className="h-8 w-full max-w-40 rounded-md bg-secondary" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-20 w-full rounded-md bg-secondary" />
      </CardContent>
    </>
  )
}

export const Shadow: Story = {
  render: () => (
    <CardExtended variant="shadow" className="w-72">
      <SampleContent />
    </CardExtended>
  ),
}

export const Lines: Story = {
  render: () => (
    <div className="w-72">
      <CardExtended variant="lines">
        <SampleContent />
      </CardExtended>
    </div>
  ),
}

export const Hatched: Story = {
  render: () => (
    <CardExtended variant="hatched" className="w-72">
      <SampleContent />
    </CardExtended>
  ),
}

export const Aurora: Story = {
  render: () => (
    <CardExtended variant="aurora" className="w-72">
      <SampleContent />
    </CardExtended>
  ),
}

export const Tilted: Story = {
  render: () => (
    <div className="w-72 py-10">
      <CardExtended variant="tilted">
        <SampleContent />
      </CardExtended>
    </div>
  ),
}

export const Stacked: Story = {
  render: () => (
    <div className="w-72">
      <CardExtended variant="stacked">
        <SampleContent />
      </CardExtended>
    </div>
  ),
}
