import { describe, expect, it } from "vitest"

import { assertLocalDb } from "./local-db-guard"

function mockLookup(address: string) {
  return async () => ({ address })
}

describe("assertLocalDb", () => {
  describe("strict-local branch (no override)", () => {
    it("accepts localhost:54322 resolving to loopback", async () => {
      const result = await assertLocalDb(
        "postgres://app_owner:pw@localhost:54322/monorepo",
        { lookupHost: mockLookup("127.0.0.1") },
      )
      expect(result.branch).toBe("local")
      expect(result.port).toBe(54322)
      expect(result.resolvedAddress).toBe("127.0.0.1")
    })

    it("rejects localhost:5432 (SSM port-forward attack vector)", async () => {
      await expect(
        assertLocalDb("postgres://app_owner:pw@localhost:5432/monorepo", {
          lookupHost: mockLookup("127.0.0.1"),
        }),
      ).rejects.toThrow(/does not match dev compose port 54322/)
    })

    it("rejects host resolving to a public address even on dev port", async () => {
      await expect(
        assertLocalDb("postgres://app_owner:pw@evil.example.com:54322/db", {
          lookupHost: mockLookup("203.0.113.10"),
        }),
      ).rejects.toThrow(/not loopback/)
    })

    it("rejects when DATABASE_DIRECT_URL is not a valid URL", async () => {
      await expect(
        assertLocalDb("not-a-url", { lookupHost: mockLookup("127.0.0.1") }),
      ).rejects.toThrow(/not a valid URL/)
    })
  })

  describe("explicit-override branch", () => {
    it("requires --typed-env-name when --i-know-this-is-not-local is set", async () => {
      await expect(
        assertLocalDb("postgres://app_owner:pw@127.0.0.1:5432/monorepo", {
          iKnowThisIsNotLocal: true,
          lookupHost: mockLookup("127.0.0.1"),
        }),
      ).rejects.toThrow(/requires --typed-env-name/)
    })

    it("rejects --typed-env-name=production unconditionally", async () => {
      await expect(
        assertLocalDb("postgres://app_owner:pw@127.0.0.1:5432/monorepo", {
          iKnowThisIsNotLocal: true,
          typedEnvName: "production",
          lookupHost: mockLookup("127.0.0.1"),
        }),
      ).rejects.toThrow(/'production' is never accepted/)
    })

    it("accepts staging-via-SSM tunnel (loopback after dns lookup)", async () => {
      const result = await assertLocalDb(
        "postgres://app_owner:pw@127.0.0.1:5432/monorepo",
        {
          iKnowThisIsNotLocal: true,
          typedEnvName: "staging",
          lookupHost: mockLookup("127.0.0.1"),
        },
      )
      expect(result.branch).toBe("explicit-override")
      expect(result.resolvedAddress).toBe("127.0.0.1")
    })

    it("accepts private RFC1918 address with override + env name", async () => {
      const result = await assertLocalDb(
        "postgres://app_owner:pw@vpc-host:5432/monorepo",
        {
          iKnowThisIsNotLocal: true,
          typedEnvName: "staging",
          lookupHost: mockLookup("10.0.42.13"),
        },
      )
      expect(result.branch).toBe("explicit-override")
      expect(result.resolvedAddress).toBe("10.0.42.13")
    })

    it("rejects public address even with override", async () => {
      await expect(
        assertLocalDb(
          "postgres://app_owner:pw@staging.rds.amazonaws.com:5432/monorepo",
          {
            iKnowThisIsNotLocal: true,
            typedEnvName: "staging",
            lookupHost: mockLookup("54.93.10.20"),
          },
        ),
      ).rejects.toThrow(/Refusing even with override/)
    })

    it("rejects production override even when DNS resolves to loopback", async () => {
      await expect(
        assertLocalDb("postgres://app_owner:pw@127.0.0.1:5432/monorepo", {
          iKnowThisIsNotLocal: true,
          typedEnvName: "production",
          lookupHost: mockLookup("127.0.0.1"),
        }),
      ).rejects.toThrow(/'production' is never accepted/)
    })
  })
})
