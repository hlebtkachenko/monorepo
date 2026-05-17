import { render, cleanup } from "@testing-library/react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "./input-otp"

// input-otp library sets internal timers that fire after test teardown,
// causing "window is not defined" when jsdom environment is already gone.
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe("InputOTP", () => {
  it("renders without crash", () => {
    render(
      <InputOTP maxLength={4}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>,
    )
    const input = document.querySelector("input")
    expect(input).toBeInTheDocument()
  })

  it("renders separator between groups", () => {
    render(
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
      </InputOTP>,
    )
    expect(document.querySelector("[role=separator]")).toBeInTheDocument()
  })
})
