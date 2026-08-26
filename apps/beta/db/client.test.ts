import { describe, expect, it } from "vitest"
import type { BetaDatabase } from "./client"
import { betaDb, createBetaDb, readDatabaseUrl } from "./client"
import { sharedDatabaseUrl } from "../tests/scratch-db"
import { app_user } from "./schema"

describe("beta drizzle client", () => {
  it("queries through the declared schema", async () => {
    const db: BetaDatabase = createBetaDb(sharedDatabaseUrl())
    const rows = await db.select({ id: app_user.id }).from(app_user).limit(1)
    expect(Array.isArray(rows)).toBe(true)
  })

  it("refuses to guess a connection string", () => {
    const saved = process.env["DATABASE_URL"]
    delete process.env["DATABASE_URL"]
    try {
      expect(() => readDatabaseUrl()).toThrow(/DATABASE_URL is not set/)
    } finally {
      process.env["DATABASE_URL"] = saved
    }
  })

  it("builds the process-wide handle once", () => {
    expect(betaDb()).toBe(betaDb())
  })
})
