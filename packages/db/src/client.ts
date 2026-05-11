/**
 * Database client — postgres-js + Drizzle factory.
 *
 * Reads DATABASE_URL from environment. Exports `db` (the Drizzle instance),
 * `sqlClient` (the raw postgres-js client for migrations / admin), and the
 * `Db` type for use in helper signatures.
 *
 * `casing: 'snake_case'` means Drizzle translates camelCase column names in
 * query builders to snake_case SQL automatically. Schema files use snake_case
 * column names directly, so this is a belt-and-suspenders setting.
 */
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema/index.js"

const url = process.env["DATABASE_URL"]
if (!url) {
  throw new Error("DATABASE_URL environment variable is required")
}

export const sqlClient = postgres(url, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(sqlClient, {
  schema,
  casing: "snake_case",
})

export type Db = typeof db
