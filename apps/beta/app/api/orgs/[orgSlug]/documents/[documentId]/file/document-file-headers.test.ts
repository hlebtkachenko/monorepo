/**
 * The document file route's response headers, over REAL HTTP.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY `route.test.ts` IS NOT ENOUGH. That
 * suite asserts headers on the `Response` OBJECT the handler returns, which is
 * not what a browser receives: `next.config.mjs` has a site-wide `headers()`
 * entry matching `/(.*)`, and for a key both sides set, the CONFIG WINS — the
 * handler's header is replaced, silently, with no warning and no duplicate. So
 * until PR 12 the suite was green while asserting a policy that never left the
 * process, and the sandboxed PDF preview of spec §2.2 was impossible: every
 * response of this route was actually carrying the site policy, `frame-ancestors
 * 'none'` included, which forbids framing by any page including our own.
 *
 * A unit test cannot see that, by construction. The only witness is a real
 * server answering a real request, which is what this file starts.
 *
 * `next build` + `next start` RATHER THAN `next dev`, for two reasons. It is
 * the pipeline that actually ships — the site-wide policy differs between the
 * two modes (dev adds `'unsafe-eval'` and drops HSTS), and it is the production
 * one that has to be right. And `next dev` refuses to start when another dev
 * server is already running in the same project directory, which would make
 * this check fail for anyone with `pnpm --filter beta dev` open. The build goes
 * to its own `distDir` so it clobbers nothing.
 *
 * IT NEEDS NO DATABASE. Every assertion is about headers, and headers are
 * applied to a 404 exactly as they are to a 200 — so the requests below are
 * anonymous and `resolveOrgScope` returns null before any query is issued.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { DOCUMENT_FILE_CSP } from "./route"

const execFileAsync = promisify(execFile)

/** `app/api/orgs/[orgSlug]/documents/[documentId]/file` → `apps/beta`. */
const APP_ROOT = resolve(import.meta.dirname, "../../../../../../..")
const NEXT_BIN = resolve(APP_ROOT, "node_modules/next/dist/bin/next")
/**
 * Inside `.next`, which is already gitignored and already a build artefact — so
 * this needs no new ignore rule and leaves nothing behind that `rm -rf .next`
 * does not already clear. Crucially it is NOT `.next` itself: the image build
 * and a developer's dev server both live there.
 */
const DIST_DIR = ".next/header-test"
const BOOT_TIMEOUT_MS = 240_000

const DOCUMENT_ID = "018f0000-0000-7000-8000-000000000000"
const FILE_PATH = `/api/orgs/acme-sro/documents/${DOCUMENT_ID}/file`
const LIST_PATH = "/api/orgs/acme-sro/documents"

const NEXT_ENV_PATH = resolve(APP_ROOT, "next-env.d.ts")

let server: ChildProcess
let origin: string
/** The tracked `next-env.d.ts` as it was before the build rewrote it. */
let nextEnvBefore: string | null = null

/** A port nobody is listening on yet. Racy in principle, free in practice. */
async function freePort(): Promise<number> {
  return new Promise((settle, fail) => {
    const probe = createServer()
    probe.on("error", fail)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      if (address === null || typeof address === "string") {
        probe.close()
        fail(new Error("could not resolve a free port"))
        return
      }
      const { port } = address
      probe.close(() => settle(port))
    })
  })
}

/** Poll until the server answers anything at all, or give up loudly. */
async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  let lastError: unknown
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`beta server exited (${server.exitCode}):\n${log}`)
    }
    try {
      await fetch(url)
      return
    } catch (error) {
      lastError = error
      await new Promise((tick) => setTimeout(tick, 300))
    }
  }
  throw new Error(
    `beta server did not answer in time: ${String(lastError)}\n${log}`,
  )
}

/** The child's output, kept so a boot failure reports the reason. */
let log = ""

/**
 * The environment both the build and the server run under.
 *
 * `DATABASE_URL` only has to be a well-formed URL: nothing connects to it. Every
 * route here is `force-dynamic`, so the build never renders one, and at request
 * time an anonymous caller is refused before any query is issued.
 */
function childEnv(origin: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BETA_DIST_DIR: DIST_DIR,
    DATABASE_URL:
      process.env["DATABASE_URL"] ?? "postgres://beta:beta@127.0.0.1:1/beta",
    BETTER_AUTH_SECRET:
      process.env["BETTER_AUTH_SECRET"] ?? `header-test-${"x".repeat(40)}`,
    BETTER_AUTH_URL: origin,
    NODE_ENV: "production",
    CI: "1",
  }
}

beforeAll(async () => {
  const port = await freePort()
  origin = `http://127.0.0.1:${port}`

  // `next build` REWRITES `next-env.d.ts` to reference its own `distDir`, and
  // that file is tracked. Snapshot it and put it back in `afterAll`, so running
  // the suite never leaves a dirty working tree.
  nextEnvBefore = await readFile(NEXT_ENV_PATH, "utf8")

  await execFileAsync(process.execPath, [NEXT_BIN, "build"], {
    cwd: APP_ROOT,
    env: childEnv(origin),
    maxBuffer: 32 * 1024 * 1024,
  })

  server = spawn(
    process.execPath,
    [NEXT_BIN, "start", "--port", String(port)],
    {
      cwd: APP_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      // Its own process group, so the cleanup below takes the whole tree with
      // it. Killing only the parent leaves a server holding the port, and the
      // next run of this file then fails on a corpse from the last one.
      detached: true,
      env: childEnv(origin),
    },
  )
  const collect = (chunk: Buffer): void => {
    log = `${log}${chunk.toString()}`.slice(-4000)
  }
  server.stdout?.on("data", collect)
  server.stderr?.on("data", collect)

  await waitForServer(`${origin}${FILE_PATH}`)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  if (server?.pid !== undefined) {
    try {
      // Negative pid = the whole process group (see `detached` above).
      process.kill(-server.pid, "SIGKILL")
    } catch {
      server.kill("SIGKILL")
    }
  }
  if (nextEnvBefore !== null) await writeFile(NEXT_ENV_PATH, nextEnvBefore)
})

describe("the document file route, as a browser sees it", () => {
  it("carries exactly the sandbox policy, and it reached the wire", async () => {
    const response = await fetch(`${origin}${FILE_PATH}`)

    // 404 — anonymous. The headers are the subject; the status only proves the
    // request reached this route rather than the 404 PAGE.
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain("application/json")

    // Strict equality, not `toContain`: duplicate headers are joined with ", "
    // by the Headers API, so this also proves there is exactly ONE policy on
    // the response. Two policies would be intersected by the browser and the
    // stricter `frame-ancestors 'none'` would win.
    expect(response.headers.get("content-security-policy")).toBe(
      DOCUMENT_FILE_CSP,
    )
  })

  it("allows same-origin framing, which is what the preview needs", async () => {
    const response = await fetch(`${origin}${FILE_PATH}`)
    const csp = response.headers.get("content-security-policy") ?? ""

    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).not.toContain("frame-ancestors 'none'")
    // The other way to forbid a frame. It has never been set here; this is the
    // assertion that keeps it that way.
    expect(response.headers.get("x-frame-options")).toBeNull()
  })

  it("confines the framed document — no scripts, no fetches, no same origin", async () => {
    const csp = (await fetch(`${origin}${FILE_PATH}`)).headers.get(
      "content-security-policy",
    )
    expect(csp).toContain("default-src 'none'")
    // Bare `sandbox`, with no allow-list: an opaque origin with no scripting.
    // `sandbox allow-scripts` would silently undo the confinement.
    expect(csp).toMatch(/;\s*sandbox\s*(;|$)/)
  })

  it("keeps every other site-wide security header", async () => {
    const response = await fetch(`${origin}${FILE_PATH}`)

    // The scoped override replaces ONE key. If it ever replaced the whole
    // block, this route would quietly lose its hardening.
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    )
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow")
    // Production-only in next.config.mjs, and this IS a production build.
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    )
    expect(response.headers.get("cache-control")).toContain("no-store")
  })
})

describe("nothing else in the app was weakened", () => {
  it.each([
    ["the sibling documents list route", LIST_PATH],
    ["a page", "/sign-in"],
    ["the health endpoint", "/healthz"],
  ])("keeps frame-ancestors 'none' on %s", async (_label, path) => {
    const csp =
      (await fetch(`${origin}${path}`)).headers.get(
        "content-security-policy",
      ) ?? ""

    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain("frame-ancestors 'self'")
    expect(csp).not.toContain("sandbox")
  })

  it("does not widen the override to a sibling path under the same document", async () => {
    // The matcher ends at `/file`. A future `/thumbnail` must not inherit the
    // relaxation by accident.
    const csp =
      (
        await fetch(`${origin}/api/orgs/acme-sro/documents/${DOCUMENT_ID}`)
      ).headers.get("content-security-policy") ?? ""
    expect(csp).toContain("frame-ancestors 'none'")
  })
})

describe("the policy is declared in one place, twice", () => {
  it("keeps next.config.mjs and DOCUMENT_FILE_CSP in step", async () => {
    // A .mjs config cannot import a TS module, so the string is written twice
    // on purpose. This is what makes the duplication safe.
    const config = await readFile(resolve(APP_ROOT, "next.config.mjs"), "utf8")
    expect(config).toContain(DOCUMENT_FILE_CSP)
    expect(config).toContain("/api/orgs/:orgSlug/documents/:documentId/file")
  })
})
