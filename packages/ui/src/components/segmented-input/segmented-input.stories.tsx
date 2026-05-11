import type { Meta, StoryObj } from "@storybook/react"
import { Label } from "@workspace/ui/components/label"
import { SegmentedInput, SegmentedInputItem } from "./segmented-input"

const meta: Meta<typeof SegmentedInput> = {
  title: "Components/SegmentedInput",
  component: SegmentedInput,
}
export default meta
type Story = StoryObj<typeof SegmentedInput>

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label>Date of birth</Label>
      <SegmentedInput>
        <SegmentedInputItem
          placeholder="MM"
          maxLength={2}
          className="w-14 text-center"
        />
        <SegmentedInputItem
          placeholder="DD"
          maxLength={2}
          className="w-14 text-center"
        />
        <SegmentedInputItem
          placeholder="YYYY"
          maxLength={4}
          className="w-20 text-center"
        />
      </SegmentedInput>
    </div>
  ),
}

export const Small: Story = {
  render: () => (
    <SegmentedInput size="sm">
      <SegmentedInputItem
        placeholder="A"
        maxLength={1}
        className="w-10 text-center"
      />
      <SegmentedInputItem
        placeholder="B"
        maxLength={1}
        className="w-10 text-center"
      />
      <SegmentedInputItem
        placeholder="C"
        maxLength={1}
        className="w-10 text-center"
      />
    </SegmentedInput>
  ),
}

export const Large: Story = {
  render: () => (
    <SegmentedInput size="lg">
      <SegmentedInputItem
        placeholder="A"
        maxLength={1}
        className="w-12 text-center"
      />
      <SegmentedInputItem
        placeholder="B"
        maxLength={1}
        className="w-12 text-center"
      />
      <SegmentedInputItem
        placeholder="C"
        maxLength={1}
        className="w-12 text-center"
      />
    </SegmentedInput>
  ),
}

export const Vertical: Story = {
  render: () => (
    <SegmentedInput orientation="vertical">
      <SegmentedInputItem placeholder="A" className="w-32" />
      <SegmentedInputItem placeholder="B" className="w-32" />
      <SegmentedInputItem placeholder="C" className="w-32" />
    </SegmentedInput>
  ),
}

export const Disabled: Story = {
  render: () => (
    <SegmentedInput disabled>
      <SegmentedInputItem
        placeholder="MM"
        maxLength={2}
        className="w-14 text-center"
      />
      <SegmentedInputItem
        placeholder="DD"
        maxLength={2}
        className="w-14 text-center"
      />
      <SegmentedInputItem
        placeholder="YYYY"
        maxLength={4}
        className="w-20 text-center"
      />
    </SegmentedInput>
  ),
}

export const Invalid: Story = {
  render: () => (
    <SegmentedInput invalid>
      <SegmentedInputItem
        placeholder="MM"
        maxLength={2}
        className="w-14 text-center"
      />
      <SegmentedInputItem
        placeholder="DD"
        maxLength={2}
        className="w-14 text-center"
      />
      <SegmentedInputItem
        placeholder="YYYY"
        maxLength={4}
        className="w-20 text-center"
      />
    </SegmentedInput>
  ),
}

export const Rtl: Story = {
  render: () => (
    <SegmentedInput dir="rtl">
      <SegmentedInputItem
        placeholder="MM"
        maxLength={2}
        className="w-14 text-center"
      />
      <SegmentedInputItem
        placeholder="DD"
        maxLength={2}
        className="w-14 text-center"
      />
      <SegmentedInputItem
        placeholder="YYYY"
        maxLength={4}
        className="w-20 text-center"
      />
    </SegmentedInput>
  ),
}
