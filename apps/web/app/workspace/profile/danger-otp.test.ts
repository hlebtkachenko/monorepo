import { describe, expect, it } from "vitest"

import { createDangerOtpValue, verifyDangerOtpValue } from "./danger-otp"

const SECRET = "0123456789abcdef0123456789abcdef"
const IDENTIFIER = "app:profile-danger:delete_account:user-1"

describe("profile danger OTP", () => {
  it("accepts the issued code once it is checked against the same purpose", () => {
    const value = createDangerOtpValue(SECRET, IDENTIFIER, "123456")

    expect(
      verifyDangerOtpValue(SECRET, IDENTIFIER, "123456", value),
    ).toMatchObject({ matches: true, attempts: 0 })
  })

  it("rejects a wrong code or a code issued for another purpose", () => {
    const value = createDangerOtpValue(SECRET, IDENTIFIER, "123456")

    expect(
      verifyDangerOtpValue(SECRET, IDENTIFIER, "654321", value).matches,
    ).toBe(false)
    expect(
      verifyDangerOtpValue(
        SECRET,
        "app:profile-danger:leave_workspace:user-1",
        "123456",
        value,
      ).matches,
    ).toBe(false)
  })

  it("preserves attempt counts and rejects malformed stored values safely", () => {
    const value = createDangerOtpValue(SECRET, IDENTIFIER, "123456").replace(
      /:0$/,
      ":4",
    )

    expect(
      verifyDangerOtpValue(SECRET, IDENTIFIER, "000000", value),
    ).toMatchObject({ matches: false, attempts: 4 })
    expect(() =>
      verifyDangerOtpValue(SECRET, IDENTIFIER, "123456", "not-a-hash:bad"),
    ).not.toThrow()
  })
})
