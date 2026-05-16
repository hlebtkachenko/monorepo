import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, within } from "storybook/test"
import {
  INPUT_OTP_PATTERNS,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "./input-otp"

const meta: Meta<typeof InputOTP> = {
  title: "Components/InputOTP",
  component: InputOTP,
}
export default meta
type Story = StoryObj<typeof InputOTP>

export const Default: Story = {
  render: () => (
    <InputOTP maxLength={6}>
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole("textbox")
    await userEvent.click(input)
    await userEvent.type(input, "123456")
    await expect(input).toHaveValue("123456")
  },
}

export const FourDigit: Story = {
  render: () => (
    <InputOTP maxLength={4}>
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
      </InputOTPGroup>
    </InputOTP>
  ),
}

export const NumericOnly: Story = {
  render: () => (
    <InputOTP
      maxLength={6}
      pattern={INPUT_OTP_PATTERNS.numeric}
      inputMode="numeric"
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  ),
}

export const LargeNumeric: Story = {
  render: () => (
    <InputOTP
      maxLength={6}
      pattern={INPUT_OTP_PATTERNS.numeric}
      inputMode="numeric"
      containerClassName="w-full"
    >
      <InputOTPGroup size="xl">
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  ),
}
