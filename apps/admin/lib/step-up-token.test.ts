import { describe, expect, it } from "vitest"

import {
  signStepUpToken,
  verifyStepUpToken,
  type StepUpPayload,
} from "./step-up-token"

const SECRET = "test-secret-test-secret-test-secret-test-secret"
const OTHER_SECRET = "other-secret-other-secret-other-secret-other-x"

function makePayload(over: Partial<StepUpPayload> = {}): StepUpPayload {
  return {
    user_id: "u-1",
    session_id: "s-1",
    level: "password",
    exp: Date.now() + 60_000,
    ...over,
  }
}

describe("signStepUpToken + verifyStepUpToken", () => {
  it("round-trips a valid payload", () => {
    const p = makePayload()
    const token = signStepUpToken(p, SECRET)
    expect(verifyStepUpToken(token, SECRET)).toEqual(p)
  })

  it("rejects a token signed with a different secret", () => {
    const token = signStepUpToken(makePayload(), OTHER_SECRET)
    expect(verifyStepUpToken(token, SECRET)).toBeNull()
  })

  it("rejects a tampered body", () => {
    const token = signStepUpToken(makePayload(), SECRET)
    const [body, sig] = token.split(".")
    // Flip a char in the body without re-signing.
    const tampered = body!.slice(0, -1) + "A" + "." + sig!
    expect(verifyStepUpToken(tampered, SECRET)).toBeNull()
  })

  it("rejects a tampered signature", () => {
    const token = signStepUpToken(makePayload(), SECRET)
    const [body, sig] = token.split(".")
    const tampered = body + "." + sig!.slice(0, -1) + "A"
    expect(verifyStepUpToken(tampered, SECRET)).toBeNull()
  })

  it("rejects a token with malformed shape (no dot)", () => {
    expect(verifyStepUpToken("abc", SECRET)).toBeNull()
  })

  it("rejects a token whose body is not valid JSON", () => {
    const garbage = Buffer.from("not json").toString("base64url")
    const fakeSig = signStepUpToken(makePayload(), SECRET).split(".")[1]!
    expect(verifyStepUpToken(`${garbage}.${fakeSig}`, SECRET)).toBeNull()
  })

  it("rejects a token missing required fields", () => {
    // user_id missing
    const body = Buffer.from(
      JSON.stringify({ session_id: "s-1", level: "password", exp: 1 }),
    ).toString("base64url")
    // Re-derive a matching signature so we exercise the shape check, not
    // the HMAC check.
    const reconstructed = signStepUpToken(makePayload(), SECRET)
    const sig = reconstructed.split(".")[1]!
    // Sig won't match because body changed; that's fine — verifies
    // shape rejection happens BEFORE we get here. To isolate the shape
    // check, sign the bad body explicitly.
    const goodBodyToken = signStepUpToken(
      makePayload({ user_id: "" as unknown as string }),
      SECRET,
    )
    expect(verifyStepUpToken(goodBodyToken, SECRET)).toBeNull()
    expect(verifyStepUpToken(`${body}.${sig}`, SECRET)).toBeNull()
  })

  it("rejects an unknown level", () => {
    const bad = signStepUpToken(
      makePayload({ level: "hardware" as unknown as "password" }),
      SECRET,
    )
    expect(verifyStepUpToken(bad, SECRET)).toBeNull()
  })

  it("preserves the level (password vs twofa) on round-trip", () => {
    const tw = signStepUpToken(makePayload({ level: "twofa" }), SECRET)
    expect(verifyStepUpToken(tw, SECRET)?.level).toBe("twofa")
    const pw = signStepUpToken(makePayload({ level: "password" }), SECRET)
    expect(verifyStepUpToken(pw, SECRET)?.level).toBe("password")
  })
})
