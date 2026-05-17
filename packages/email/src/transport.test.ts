import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Prevent real SDK clients from making network calls during construction.
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn() }
  },
}))

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = vi.fn()
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
}))

// Env keys touched by pickTransport()
const ENV_KEYS = [
  "EMAIL_TRANSPORT",
  "RESEND_API_KEY",
  "AWS_REGION",
  "NODE_ENV",
] as const

function saveEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
}

function restoreEnv(saved: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = saved[k]
    }
  }
}

describe("pickTransport — transport selection", () => {
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    savedEnv = saveEnv()
    // Start each test in a clean state that won't accidentally fire real email
    // (mirrors the dev environment where NODE_ENV is not 'production').
    delete process.env.EMAIL_TRANSPORT
    delete process.env.RESEND_API_KEY
    delete process.env.AWS_REGION
    process.env.NODE_ENV = "test"
  })

  afterEach(() => {
    restoreEnv(savedEnv)
  })

  it("selects ConsoleTransport when EMAIL_TRANSPORT=console", async () => {
    vi.resetModules()
    process.env.EMAIL_TRANSPORT = "console"
    const { getTransport } = await import("./transport")
    expect(getTransport().kind).toBe("console")
  })

  it("selects ResendTransport when EMAIL_TRANSPORT=resend and RESEND_API_KEY is set", async () => {
    vi.resetModules()
    process.env.EMAIL_TRANSPORT = "resend"
    process.env.RESEND_API_KEY = "re_test_key"
    const { getTransport } = await import("./transport")
    expect(getTransport().kind).toBe("resend")
  })

  it("throws when EMAIL_TRANSPORT=resend but RESEND_API_KEY is absent", async () => {
    vi.resetModules()
    process.env.EMAIL_TRANSPORT = "resend"
    delete process.env.RESEND_API_KEY
    const { getTransport } = await import("./transport")
    expect(() => getTransport()).toThrowError(
      "EMAIL_TRANSPORT=resend but RESEND_API_KEY is not set",
    )
  })

  it("selects SesTransport when EMAIL_TRANSPORT=ses and AWS_REGION is set", async () => {
    vi.resetModules()
    process.env.EMAIL_TRANSPORT = "ses"
    process.env.AWS_REGION = "eu-central-1"
    const { getTransport } = await import("./transport")
    expect(getTransport().kind).toBe("ses")
  })

  it("throws when EMAIL_TRANSPORT=ses but AWS_REGION is absent", async () => {
    vi.resetModules()
    process.env.EMAIL_TRANSPORT = "ses"
    delete process.env.AWS_REGION
    const { getTransport } = await import("./transport")
    expect(() => getTransport()).toThrowError(
      "EMAIL_TRANSPORT=ses but AWS_REGION is not set",
    )
  })

  it("falls back to ConsoleTransport when EMAIL_TRANSPORT is unset and NODE_ENV is not production", async () => {
    vi.resetModules()
    delete process.env.EMAIL_TRANSPORT
    process.env.RESEND_API_KEY = "re_test_key"
    process.env.AWS_REGION = "eu-central-1"
    process.env.NODE_ENV = "development"
    const { getTransport } = await import("./transport")
    // Even though RESEND_API_KEY and AWS_REGION are present, the dev guard
    // must win — otherwise stray env vars fire real email on a dev machine.
    expect(getTransport().kind).toBe("console")
  })

  it("falls back to ConsoleTransport when EMAIL_TRANSPORT is unset and no credentials are present in production", async () => {
    vi.resetModules()
    delete process.env.EMAIL_TRANSPORT
    delete process.env.RESEND_API_KEY
    delete process.env.AWS_REGION
    process.env.NODE_ENV = "production"
    const { getTransport } = await import("./transport")
    expect(getTransport().kind).toBe("console")
  })

  it("selects ResendTransport via auto-detect in production when RESEND_API_KEY is set", async () => {
    vi.resetModules()
    delete process.env.EMAIL_TRANSPORT
    process.env.RESEND_API_KEY = "re_live_key"
    delete process.env.AWS_REGION
    process.env.NODE_ENV = "production"
    const { getTransport } = await import("./transport")
    expect(getTransport().kind).toBe("resend")
  })

  it("selects SesTransport via auto-detect in production when only AWS_REGION is set", async () => {
    vi.resetModules()
    delete process.env.EMAIL_TRANSPORT
    delete process.env.RESEND_API_KEY
    process.env.AWS_REGION = "eu-central-1"
    process.env.NODE_ENV = "production"
    const { getTransport } = await import("./transport")
    expect(getTransport().kind).toBe("ses")
  })

  it("getTransport() returns the same instance on repeated calls (cached)", async () => {
    vi.resetModules()
    process.env.EMAIL_TRANSPORT = "console"
    const { getTransport } = await import("./transport")
    const first = getTransport()
    const second = getTransport()
    expect(first).toBe(second)
  })
})
