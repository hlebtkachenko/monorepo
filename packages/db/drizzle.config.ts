// drizzle-kit generate is forbidden — see ADR-0007 (forthcoming).
// Migrations live in ./migrations/ as handwritten SQL.

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://app_owner:app_owner_dev@localhost:5432/workspace_dev',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
} satisfies Config;
