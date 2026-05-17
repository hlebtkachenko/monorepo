import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, within } from "storybook/test"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "./combobox"

const meta: Meta<typeof Combobox> = {
  title: "Components/Combobox",
  component: Combobox,
}
export default meta
type Story = StoryObj<typeof Combobox>

const fruits = ["Apple", "Banana", "Blueberry", "Mango", "Orange", "Peach"]

export const Disabled: Story = {
  render: () => (
    <Combobox>
      <ComboboxInput disabled placeholder="Search fruit..." />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>No fruit found.</ComboboxEmpty>
          {fruits.map((fruit) => (
            <ComboboxItem key={fruit} value={fruit}>
              {fruit}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  ),
}

export const Default: Story = {
  render: () => (
    <Combobox>
      <ComboboxInput placeholder="Search fruit..." />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>No fruit found.</ComboboxEmpty>
          {fruits.map((fruit) => (
            <ComboboxItem key={fruit} value={fruit}>
              {fruit}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByPlaceholderText("Search fruit...")
    await userEvent.click(input)
    await userEvent.type(input, "Ban")
    const body = within(document.body)
    await expect(await body.findByText("Banana")).toBeInTheDocument()
  },
}
