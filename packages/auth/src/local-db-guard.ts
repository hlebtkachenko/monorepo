import { lookup } from "node:dns/promises"
import { isIPv4 } from "node:net"

const DEV_COMPOSE_PORT = 54322

export interface AssertLocalDbOpts {
  iKnowThisIsNotLocal?: boolean
  typedEnvName?: string
  devPort?: number
  lookupHost?: (host: string) => Promise<{ address: string }>
}

export interface AssertLocalDbResult {
  host: string
  port: number
  resolvedAddress: string
  branch: "local" | "explicit-override"
}

function isLoopback(address: string): boolean {
  if (address === "::1") return true
  if (!isIPv4(address)) return false
  return address.startsWith("127.")
}

function isPrivateIPv4(address: string): boolean {
  if (!isIPv4(address)) return false
  const parts = address.split(".").map(Number)
  const [a, b] = parts
  if (a === 10) return true
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

export async function assertLocalDb(
  url: string,
  opts: AssertLocalDbOpts = {},
): Promise<AssertLocalDbResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("DATABASE_DIRECT_URL is not a valid URL")
  }

  const host = parsed.hostname
  const port = parsed.port ? Number(parsed.port) : 5432
  const devPort = opts.devPort ?? DEV_COMPOSE_PORT
  const dnsLookup = opts.lookupHost ?? ((h: string) => lookup(h))

  const { address } = await dnsLookup(host)

  if (opts.typedEnvName === "production") {
    throw new Error("'production' is never accepted by this script")
  }

  if (!opts.iKnowThisIsNotLocal) {
    if (port !== devPort) {
      throw new Error(
        `DB port ${port} does not match dev compose port ${devPort}. ` +
          `SSM port-forwards expose remote RDS at :5432 and would be accepted by a naive string check. ` +
          `Pass --i-know-this-is-not-local --typed-env-name=<env-name> to override (production is always blocked).`,
      )
    }
    if (!isLoopback(address)) {
      throw new Error(
        `Host ${host} resolves to ${address}, which is not loopback. Refusing.`,
      )
    }
    return { host, port, resolvedAddress: address, branch: "local" }
  }

  if (!opts.typedEnvName) {
    throw new Error(
      "--i-know-this-is-not-local requires --typed-env-name=<env-name>",
    )
  }

  if (!isLoopback(address) && !isPrivateIPv4(address)) {
    throw new Error(
      `Host ${host} resolves to public address ${address}. Refusing even with override.`,
    )
  }

  return {
    host,
    port,
    resolvedAddress: address,
    branch: "explicit-override",
  }
}
