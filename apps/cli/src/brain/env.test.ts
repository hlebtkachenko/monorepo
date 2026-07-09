import { describe, expect, it } from "vitest"
import { resolveBrainEnv } from "./env"

// M0.2a — a fresh Brain session needs ONLY BRAIN_API_KEY pasted in. Every other var must default to a sane
// value so `resolveBrainEnv` is the single, unit-tested source of truth for that collapse.

describe("resolveBrainEnv (M0.2a env-collapse)", () => {
  it("resolves every default when ONLY BRAIN_API_KEY is set (the acceptance criterion)", () => {
    const env = resolveBrainEnv({ BRAIN_API_KEY: "affk_live_secret" })
    expect(env).toEqual({
      mcpEndpoint: "https://api.afframe.com",
      apiKey: "affk_live_secret",
      agentSdkAuth: "ambient",
    })
  })

  it("resolves every default from a completely empty env (apiKey empty, not thrown)", () => {
    const env = resolveBrainEnv({})
    expect(env.mcpEndpoint).toBe("https://api.afframe.com")
    expect(env.apiKey).toBe("")
    expect(env.agentSdkAuth).toBe("ambient")
  })

  it("an explicit BRAIN_MCP_ENDPOINT overrides the production default", () => {
    const env = resolveBrainEnv({
      BRAIN_API_KEY: "k",
      BRAIN_MCP_ENDPOINT: "http://127.0.0.1:3001",
    })
    expect(env.mcpEndpoint).toBe("http://127.0.0.1:3001")
  })

  it("an explicit BRAIN_AGENT_SDK_AUTH overrides the ambient default", () => {
    const env = resolveBrainEnv({
      BRAIN_API_KEY: "k",
      BRAIN_AGENT_SDK_AUTH: "sk-ant-real",
    })
    expect(env.agentSdkAuth).toBe("sk-ant-real")
  })

  it("treats an empty-string env value the same as unset (falls back to the default)", () => {
    const env = resolveBrainEnv({
      BRAIN_API_KEY: "k",
      BRAIN_MCP_ENDPOINT: "",
      BRAIN_AGENT_SDK_AUTH: "",
    })
    expect(env.mcpEndpoint).toBe("https://api.afframe.com")
    expect(env.agentSdkAuth).toBe("ambient")
  })

  it("never fabricates a BRAIN_API_KEY default — the one required paste stays required", () => {
    // Every other var defaults; the key must not, or a fresh session could silently run under no identity.
    const env = resolveBrainEnv({
      BRAIN_MCP_ENDPOINT: "https://api.afframe.com",
    })
    expect(env.apiKey).toBe("")
  })

  it("does not read BRAIN_RUNTIME_ACTIVE or BRAIN_LIVE at all (dropped client-side gate, #591/M0.2a)", () => {
    // Present-but-off values must have zero effect on the resolved env — the server is the sole authority.
    const env = resolveBrainEnv({
      BRAIN_API_KEY: "k",
      BRAIN_RUNTIME_ACTIVE: "0",
      BRAIN_LIVE: "",
    })
    expect(env).toEqual({
      mcpEndpoint: "https://api.afframe.com",
      apiKey: "k",
      agentSdkAuth: "ambient",
    })
  })
})
