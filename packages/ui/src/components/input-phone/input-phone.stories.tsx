import * as React from "react"
import type { Meta, StoryObj } from "@storybook/react"

import { PhoneInput, PhoneInputCountry, PhoneInputField } from "./input-phone"

const meta: Meta<typeof PhoneInput> = {
  title: "Components/InputPhone",
  component: PhoneInput,
  parameters: { layout: "padded" },
}
export default meta
type Story = StoryObj<typeof PhoneInput>

function Controlled({ initial = "+420" }: { initial?: string }) {
  const [value, setValue] = React.useState(initial)
  return (
    <div className="w-full max-w-sm">
      <PhoneInput value={value} onValueChange={setValue} defaultCountry="CZ">
        <PhoneInputCountry />
        <PhoneInputField />
      </PhoneInput>
      <p className="mt-2 text-xs text-muted-foreground">Value: {value}</p>
    </div>
  )
}

export const Default: Story = {
  render: () => <Controlled />, // uses initial="+420"
}

export const Uncontrolled: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <PhoneInput defaultCountry="US">
        <PhoneInputCountry />
        <PhoneInputField />
      </PhoneInput>
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <PhoneInput disabled defaultCountry="DE" defaultValue="+49301234567">
        <PhoneInputCountry />
        <PhoneInputField />
      </PhoneInput>
    </div>
  ),
}

export const ReadOnly: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <PhoneInput readOnly defaultCountry="GB" defaultValue="+442012345678">
        <PhoneInputCountry />
        <PhoneInputField />
      </PhoneInput>
    </div>
  ),
}

export const Invalid: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <PhoneInput invalid defaultCountry="FR" defaultValue="+33">
        <PhoneInputCountry />
        <PhoneInputField />
      </PhoneInput>
    </div>
  ),
}

export const WithoutFlag: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <PhoneInput showFlag={false} defaultCountry="JP" defaultValue="+8131234">
        <PhoneInputCountry />
        <PhoneInputField />
      </PhoneInput>
    </div>
  ),
}
