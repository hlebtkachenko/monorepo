import type { Meta, StoryObj } from "@storybook/react"
import { Label } from "@workspace/ui/components/label"
import { InputSegmented, InputSegmentedItem } from "./input-segmented"

const meta: Meta<typeof InputSegmented> = {
  title: "Components/InputSegmented",
  component: InputSegmented,
}
export default meta
type Story = StoryObj<typeof InputSegmented>

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label>Date of birth</Label>
      <InputSegmented>
        <InputSegmentedItem
          placeholder="MM"
          maxLength={2}
          className="w-14 text-center"
        />
        <InputSegmentedItem
          placeholder="DD"
          maxLength={2}
          className="w-14 text-center"
        />
        <InputSegmentedItem
          placeholder="YYYY"
          maxLength={4}
          className="w-20 text-center"
        />
      </InputSegmented>
    </div>
  ),
}

export const Small: Story = {
  render: () => (
    <InputSegmented size="sm">
      <InputSegmentedItem
        placeholder="A"
        maxLength={1}
        className="w-10 text-center"
      />
      <InputSegmentedItem
        placeholder="B"
        maxLength={1}
        className="w-10 text-center"
      />
      <InputSegmentedItem
        placeholder="C"
        maxLength={1}
        className="w-10 text-center"
      />
    </InputSegmented>
  ),
}

export const Large: Story = {
  render: () => (
    <InputSegmented size="lg">
      <InputSegmentedItem
        placeholder="A"
        maxLength={1}
        className="w-12 text-center"
      />
      <InputSegmentedItem
        placeholder="B"
        maxLength={1}
        className="w-12 text-center"
      />
      <InputSegmentedItem
        placeholder="C"
        maxLength={1}
        className="w-12 text-center"
      />
    </InputSegmented>
  ),
}

export const Vertical: Story = {
  render: () => (
    <InputSegmented orientation="vertical">
      <InputSegmentedItem placeholder="A" className="w-32" />
      <InputSegmentedItem placeholder="B" className="w-32" />
      <InputSegmentedItem placeholder="C" className="w-32" />
    </InputSegmented>
  ),
}

export const Disabled: Story = {
  render: () => (
    <InputSegmented disabled>
      <InputSegmentedItem
        placeholder="MM"
        maxLength={2}
        className="w-14 text-center"
      />
      <InputSegmentedItem
        placeholder="DD"
        maxLength={2}
        className="w-14 text-center"
      />
      <InputSegmentedItem
        placeholder="YYYY"
        maxLength={4}
        className="w-20 text-center"
      />
    </InputSegmented>
  ),
}

export const Invalid: Story = {
  render: () => (
    <InputSegmented invalid>
      <InputSegmentedItem
        placeholder="MM"
        maxLength={2}
        className="w-14 text-center"
      />
      <InputSegmentedItem
        placeholder="DD"
        maxLength={2}
        className="w-14 text-center"
      />
      <InputSegmentedItem
        placeholder="YYYY"
        maxLength={4}
        className="w-20 text-center"
      />
    </InputSegmented>
  ),
}

export const Rtl: Story = {
  render: () => (
    <InputSegmented dir="rtl">
      <InputSegmentedItem
        placeholder="MM"
        maxLength={2}
        className="w-14 text-center"
      />
      <InputSegmentedItem
        placeholder="DD"
        maxLength={2}
        className="w-14 text-center"
      />
      <InputSegmentedItem
        placeholder="YYYY"
        maxLength={4}
        className="w-20 text-center"
      />
    </InputSegmented>
  ),
}
