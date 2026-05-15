import type { Meta, StoryObj } from "@storybook/react"
import { useState } from "react"
import { PasswordInput } from "./password-input"

const meta: Meta<typeof PasswordInput> = {
  title: "Components/PasswordInput",
  component: PasswordInput,
}
export default meta

type Story = StoryObj<typeof PasswordInput>

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState("")
    return <PasswordInput value={value} onValueChange={setValue} />
  },
}

export const WithGenerate: Story = {
  render: () => {
    const [value, setValue] = useState("")
    return (
      <PasswordInput
        value={value}
        onValueChange={setValue}
        showGenerate
        onGenerate={setValue}
      />
    )
  },
}

export const Filled: Story = {
  render: () => {
    const [value, setValue] = useState("S3cur3P@ssword!")
    return <PasswordInput value={value} onValueChange={setValue} />
  },
}

export const Disabled: Story = {
  args: {
    value: "hidden",
    disabled: true,
  },
}

export const Invalid: Story = {
  render: () => {
    const [value, setValue] = useState("")
    return (
      <PasswordInput
        value={value}
        onValueChange={setValue}
        aria-invalid="true"
      />
    )
  },
}
