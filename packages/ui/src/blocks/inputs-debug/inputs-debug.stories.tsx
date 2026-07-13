import type { Meta, StoryObj } from "@storybook/react"

import { InputsDebug } from "./inputs-debug"

/**
 * Dev-only gallery of every input / input-related component in packages/ui.
 * Consumed by the admin Debug → Input Fields page.
 */
const meta: Meta<typeof InputsDebug> = {
  title: "Blocks/InputsDebug",
  component: InputsDebug,
  parameters: {
    layout: "fullscreen",
    // Dev-only kitchen-sink board: it renders every input primitive bare
    // (no surrounding form/label context) purely for visual inspection, so it
    // trips label / aria / button-name axe rules that don't apply to a demo.
    // Each component's real a11y is covered by its own baselined story; skip
    // the gate here rather than pollute the a11y-baseline debt floor.
    a11y: { disable: true },
  },
}
export default meta

type Story = StoryObj<typeof InputsDebug>

export const Default: Story = {}
