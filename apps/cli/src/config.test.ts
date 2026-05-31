import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("cli config", () => {
  let dir: string
  let priorHome: string | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "afframe-cli-"))
    priorHome = process.env.HOME
    process.env.HOME = dir
    vi.resetModules()
  })

  afterEach(() => {
    if (priorHome === undefined) delete process.env.HOME
    else process.env.HOME = priorHome
    rmSync(dir, { recursive: true, force: true })
    delete process.env.AFFRAME_API_KEY
    delete process.env.AFFRAME_API_BASE
    delete process.env.AFFRAME_PROFILE
  })

  it("returns undefined when no profile is configured and no env is set", async () => {
    const mod = await import("./config")
    expect(mod.loadConfig()).toBeUndefined()
  })

  it("saveProfile writes mode 0600 and loadConfig reads it back", async () => {
    const mod = await import("./config")
    mod.saveProfile("default", "affk_test_xyz", "http://127.0.0.1:3001")
    const cfg = mod.loadConfig()
    expect(cfg).toEqual({
      apiKey: "affk_test_xyz",
      apiBase: "http://127.0.0.1:3001",
      profile: "default",
    })
    const path = join(dir, ".config", "afframe", "config.toml")
    const mode = statSync(path).mode & 0o777
    expect(mode).toBe(0o600)
    expect(readFileSync(path, "utf8")).toContain(
      'default.api_key = "affk_test_xyz"',
    )
  })

  it("AFFRAME_API_KEY env overrides the file", async () => {
    const mod = await import("./config")
    mod.saveProfile("default", "affk_test_file", "http://from-file")
    process.env.AFFRAME_API_KEY = "affk_test_env"
    process.env.AFFRAME_API_BASE = "http://from-env"
    const cfg = mod.loadConfig()
    expect(cfg?.apiKey).toBe("affk_test_env")
    expect(cfg?.apiBase).toBe("http://from-env")
  })

  it("AFFRAME_PROFILE selects a different profile", async () => {
    const mod = await import("./config")
    mod.saveProfile("staging", "affk_test_stg", "http://stg")
    mod.saveProfile("default", "affk_live_prod")
    process.env.AFFRAME_PROFILE = "staging"
    const cfg = mod.loadConfig()
    expect(cfg?.profile).toBe("staging")
    expect(cfg?.apiKey).toBe("affk_test_stg")
    expect(cfg?.apiBase).toBe("http://stg")
  })

  it("clearProfile removes only the named profile", async () => {
    const mod = await import("./config")
    mod.saveProfile("default", "affk_test_a")
    mod.saveProfile("staging", "affk_test_b")
    mod.clearProfile("default")
    expect(mod.loadConfig()).toBeUndefined()
    process.env.AFFRAME_PROFILE = "staging"
    expect(mod.loadConfig()?.apiKey).toBe("affk_test_b")
  })
})
