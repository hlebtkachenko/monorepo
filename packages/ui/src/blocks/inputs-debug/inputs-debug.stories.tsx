import type { Meta, StoryObj } from "@storybook/react"

import { InputsDebug } from "./inputs-debug"

/**
 * Dev-only gallery of every input / input-related component in packages/ui.
 * Consumed by the web `/dev/inputs` route and the admin Debug → Input Fields page.
 */
const meta: Meta<typeof InputsDebug> = {
  title: "Blocks/InputsDebug",
  component: InputsDebug,
  parameters: { layout: "fullscreen" },
}
export default meta

type Story = StoryObj<typeof InputsDebug>

export const Default: Story = {}
