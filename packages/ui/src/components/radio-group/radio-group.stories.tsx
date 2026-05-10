import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, within } from "storybook/test"
import { RadioGroup, RadioGroupItem } from "./radio-group"

const meta: Meta<typeof RadioGroup> = {
  title: "Components/RadioGroup",
  component: RadioGroup,
}
export default meta
type Story = StoryObj<typeof RadioGroup>

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="option-1">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-1" id="option-1" />
        <label htmlFor="option-1">Option 1</label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-2" id="option-2" />
        <label htmlFor="option-2">Option 2</label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-3" id="option-3" />
        <label htmlFor="option-3">Option 3</label>
      </div>
    </RadioGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const option2 = canvas.getByRole("radio", { name: /option 2/i })
    await userEvent.click(option2)
    await expect(option2).toBeChecked()
    await expect(
      canvas.getByRole("radio", { name: /option 1/i }),
    ).not.toBeChecked()
  },
}

export const Horizontal: Story = {
  render: () => (
    <RadioGroup defaultValue="yes" className="flex gap-4">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="yes" id="yes" />
        <label htmlFor="yes">Yes</label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="no" id="no" />
        <label htmlFor="no">No</label>
      </div>
    </RadioGroup>
  ),
}

export const Disabled: Story = {
  args: { children: "Disabled", disabled: true },
}
