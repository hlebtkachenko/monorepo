import { describe, it, expect } from "vitest"
import { parseCommand, randomToken } from "./dispatch.js"

describe("parseCommand", () => {
  it("deploy staging -> _deploy-aws app-only", () => {
    const { plan, error } = parseCommand("deploy", "staging")
    expect(error).toBeUndefined()
    expect(plan?.workflow).toBe("_deploy-aws.yml")
    expect(plan?.inputs).toEqual({ environment: "staging", stack: "app-only" })
    expect(plan?.ref).toBe("main")
  })

  it("deploy production accepted", () => {
    expect(parseCommand("deploy", "production").plan?.inputs.environment).toBe(
      "production",
    )
  })

  it("rejects an unknown environment", () => {
    expect(parseCommand("deploy", "prod").error).toMatch(/Usage/)
    expect(parseCommand("deploy", "").error).toMatch(/Usage/)
  })

  it("rollback requires env + tag", () => {
    expect(parseCommand("rollback", "staging").error).toMatch(/Usage/)
    const { plan } = parseCommand("rollback", "staging sha-abc123")
    // Input name must match _deploy-aws.yml's workflow_dispatch declaration
    // (image_tag_override) or GitHub rejects the dispatch with 422.
    expect(plan?.inputs).toEqual({
      environment: "staging",
      image_tag_override: "sha-abc123",
    })
  })

  it("deploybot + dast take no args", () => {
    expect(parseCommand("deploybot", "").plan?.workflow).toBe("deploy-bot.yml")
    expect(parseCommand("dast", "").plan?.workflow).toBe("nuclei-dast.yml")
  })

  it("unknown command errors", () => {
    expect(parseCommand("nuke", "").error).toMatch(/Unknown/)
    expect(parseCommand("nuke", "").plan).toBeUndefined()
  })
})

describe("randomToken", () => {
  it("is 16 hex chars and unique", () => {
    const a = randomToken()
    const b = randomToken()
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(a).not.toBe(b)
  })
})
