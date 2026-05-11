import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"
import { ColorPicker } from "./color-picker"

const meta: Meta<typeof ColorPicker> = {
  title: "Components/ColorPicker",
  component: ColorPicker,
}
export default meta

type Story = StoryObj<typeof ColorPicker>

function Controlled({ initial = "#007AFF" }: { initial?: string }) {
  const [color, setColor] = React.useState(initial)
  return (
    <div className="flex items-center gap-4">
      <ColorPicker color={color} onChange={setColor} />
      <span className="text-xs text-muted-foreground">{color}</span>
    </div>
  )
}

export const Default: Story = {
  render: () => <Controlled />,
}

export const Red: Story = {
  render: () => <Controlled initial="#FF3B30" />,
}

export const Green: Story = {
  render: () => <Controlled initial="#4CD964" />,
}

export const CustomPresets: Story = {
  render: () => {
    function Custom() {
      const [color, setColor] = React.useState("#5856D6")
      return (
        <ColorPicker
          color={color}
          onChange={setColor}
          presets={[
            "#000000",
            "#FFFFFF",
            "#5856D6",
            "#FF2D55",
            "#34C759",
            "#FF9500",
          ]}
        />
      )
    }
    return <Custom />
  },
}
