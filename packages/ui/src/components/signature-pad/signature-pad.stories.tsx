import type { Meta, StoryObj } from "@storybook/react"
import { SignaturePad } from "./signature-pad"

const meta: Meta<typeof SignaturePad> = {
  title: "Components/SignaturePad",
  component: SignaturePad,
}
export default meta
type Story = StoryObj<typeof SignaturePad>

export const Default: Story = {
  render: () => (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <label className="text-sm font-medium">Signature</label>
      <SignaturePad />
      <p className="text-xs text-muted-foreground">
        Draw your signature above. Click the reset icon to clear.
      </p>
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <label className="text-sm font-medium">Signature</label>
      <SignaturePad disabled />
    </div>
  ),
}
