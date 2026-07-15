import { describe, expect, it } from "vitest"

import { accountDangerOtpEmail } from "./templates"

describe("account danger OTP email", () => {
  it("contains the one-time code and the requested action", () => {
    const message = accountDangerOtpEmail({
      to: "owner@example.com",
      code: "123456",
      purpose: "delete_account",
    })

    expect(message.subject).toBe("Confirm a sensitive account action")
    expect(message.html).toContain("123456")
    expect(message.text).toContain("delete your account")
    expect(message.text).toContain("expires in 10 minutes")
  })
})
