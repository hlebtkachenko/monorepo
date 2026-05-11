import { describe, it, expect } from "vitest"
import postgres from "postgres"

/**
 * pgBouncer transaction-mode canary (ADR-0004, ADR-0010 GUC contract).
 *
 * Two guarantees under test:
 *
 * 1. **Safe path (SET LOCAL via set_config inside BEGIN/COMMIT)**: the GUC
 *    scope is exactly the transaction. Outside the transaction, whether on
 *    the same client or a fresh pool checkout, the GUC is empty. This is
 *    what `withOrganization` relies on. Any failure here means pgBouncer is
 *    NOT in transaction mode or the transaction semantics differ from
 *    expectation, and production isolation is broken.
 *
 * 2. **Unsafe path detection (SET without LOCAL)**: asserts the known
 *    pathological behavior. Plain `SET foo = bar` outside a transaction
 *    survives on the pooled backend and WILL leak to the next pool checkout.
 *    Production code MUST NEVER use plain `SET app.*`. The
 *    `no-set-local-outside-wrapper` ESLint rule closes the code-level escape
 *    hatch, but this test proves the server-side behavior directly.
 *
 * SKIPPED unless `PGBOUNCER_URL` is set. The default vitest run uses
 * testcontainers without pgBouncer. Run via:
 *
 *   docker compose -f infra/compose/docker-compose.dev.yml up -d
 *   PGBOUNCER_URL=postgres://app_user:dev_user@localhost:6432/app_dev \
 *     pnpm --filter @workspace/db test
 */

const PGBOUNCER_URL = process.env["PGBOUNCER_URL"]

/**
 * Reset every backend in the bouncer pool so pollution from the
 * anti-pattern test (or a prior test run) cannot taint the safe-path
 * assertion. `default_pool_size` is 25 in compose; fan out 30 parallel
 * RESETs to cover every backend.
 */
async function resetBouncerPool(url: string): Promise<void> {
  const conns = Array.from({ length: 30 }, () =>
    postgres(url, { prepare: false, max: 1, onnotice: () => {} }),
  )
  try {
    await Promise.all(conns.map((c) => c.unsafe(`RESET ALL`)))
  } finally {
    await Promise.all(conns.map((c) => c.end({ timeout: 2 })))
  }
}

describe.skipIf(!PGBOUNCER_URL)("pgBouncer transaction-mode canary", () => {
  it("SET LOCAL via set_config inside a transaction scopes the GUC to the transaction only", async () => {
    const url = PGBOUNCER_URL as string
    await resetBouncerPool(url)

    const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
    try {
      await client.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', 'inside-tx', true)`,
        )
        const inner = await tx.unsafe(
          `SELECT current_setting('app.organization_id', true) AS v`,
        )
        expect((inner as Array<{ v: string }>)[0]?.v).toBe("inside-tx")
      })

      // Fresh connection on the same URL gets a fresh pool checkout in
      // transaction mode; the GUC must not be visible.
      const other = postgres(url, {
        prepare: false,
        max: 1,
        onnotice: () => {},
      })
      try {
        const rows = await other.unsafe(
          `SELECT current_setting('app.organization_id', true) AS v`,
        )
        const value = (rows as Array<{ v: string | null }>)[0]?.v ?? null
        expect(value === "" || value === null).toBe(true)
      } finally {
        await other.end({ timeout: 2 })
      }
    } finally {
      await client.end({ timeout: 2 })
    }
  })

  it("parallel pool churn: GUC set in one transaction does not bleed into concurrent checkouts", async () => {
    const url = PGBOUNCER_URL as string
    await resetBouncerPool(url)

    // Open many connections concurrently to force pool churn — the pool will
    // reuse the same backend connections in transaction mode. Each connection
    // sets a distinct org ID inside its transaction and reads it back, then
    // checks that after the transaction is done the GUC is invisible on a
    // fresh checkout.
    const N = 10
    const results = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const orgId = `org-${i}`
        const c = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
        try {
          let inside: string | null = null
          await c.begin(async (tx) => {
            await tx.unsafe(
              `SELECT set_config('app.organization_id', '${orgId}', true)`,
            )
            const rows = await tx.unsafe(
              `SELECT current_setting('app.organization_id', true) AS v`,
            )
            inside = (rows as Array<{ v: string }>)[0]?.v ?? null
          })
          return { orgId, inside }
        } finally {
          await c.end({ timeout: 2 })
        }
      }),
    )

    for (const { orgId, inside } of results) {
      expect(inside).toBe(orgId)
    }

    // After all transactions, fresh checkouts must see empty GUC.
    const check = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
    try {
      const rows = await check.unsafe(
        `SELECT current_setting('app.organization_id', true) AS v`,
      )
      const value = (rows as Array<{ v: string | null }>)[0]?.v ?? null
      expect(value === "" || value === null).toBe(true)
    } finally {
      await check.end({ timeout: 2 })
    }
  })

  it("SET without LOCAL outside a transaction leaks (documents the anti-pattern)", async () => {
    // This test documents (and proves) that plain `SET app.* = X` WITHOUT
    // LOCAL leaks across pool checkouts in session mode, or survives on
    // the backend in transaction mode. It MUST pass here so any regression
    // that accidentally uses bare `SET` is detectable.
    // Production code NEVER issues a bare SET.
    const url = PGBOUNCER_URL as string

    const a = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
    try {
      await a.unsafe(`SET app.organization_id = 'leaked-value'`)
      await a.unsafe(`SELECT 1`)
    } finally {
      await a.end({ timeout: 2 })
    }

    const b = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
    try {
      const rows = await b.unsafe(
        `SELECT current_setting('app.organization_id', true) AS v`,
      )
      const value = (rows as Array<{ v: string | null }>)[0]?.v ?? null
      // In pgBouncer transaction mode the backend is returned to the pool
      // after the implicit transaction but session-level SET persists on
      // that backend. When b gets the same backend, the leaked value is
      // still visible. If this assertion ever starts failing (value is empty)
      // it means the pool config changed to discard session state; update
      // the assertion and remove this comment.
      expect(value).toBe("leaked-value")
    } finally {
      await b.end({ timeout: 2 })
    }
  })
})
