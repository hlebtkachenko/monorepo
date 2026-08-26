import { nextJsConfig } from "@workspace/eslint-config/next-js"

/**
 * Beta adds one rule of its own: the raw Drizzle client is fenced.
 *
 * `db/client.ts` is an unscoped handle on a database that holds every client
 * book with no RLS behind it (plan Part 4). Feature code must go through
 * `lib/data/**`, where a query cannot be written without an `OrgScope` and
 * therefore cannot be written without a resolved membership. Importing the
 * client anywhere else is how that seam gets bypassed by accident.
 *
 * The allowlist is a FILE list, not a directory list, for `lib/auth`: those
 * three modules built on the raw client before the seam existed (Better Auth's
 * adapter, the session read, the setup-link consume — none of them is
 * org-scoped, they are all global-identity paths). A new auth module has to be
 * added here deliberately.
 *
 * NOTE ON SEVERITY. The shared base config registers `eslint-plugin-only-warn`,
 * which downgrades every rule in this repo to a warning, so this block is
 * advisory in `pnpm lint`. The BLOCKING enforcement is
 * `lib/data/db-client-fence.boundary.test.ts`, which walks the real TypeScript
 * AST of every source file in this app and fails the test run. Both exist on
 * purpose: the lint rule reports at the moment the import is typed, the test is
 * what CI cannot pass without.
 */

const UI_BLOCK_INTERNALS = {
  // Re-declared from the base config: a `rules` entry REPLACES the base one
  // rather than merging with it, so dropping this pattern here would silently
  // unfence the block internals for this app.
  group: ["@workspace/ui/blocks/*/*", "@workspace/ui/blocks/*/**"],
  message:
    "Import UI blocks from their index (@workspace/ui/blocks/<block>), not internal modules. Block internals (e.g. the archetype minter/registry) are private by design.",
}

const RAW_DB_CLIENT = {
  group: ["@/db/client", "**/db/client"],
  message:
    "The raw Drizzle client is fenced to db/**, lib/data/** and the three lib/auth modules that predate the seam. Org-scoped reads belong in lib/data/, where they take an OrgScope from requireScope(). See apps/beta/lib/data/scope.ts.",
}

const DB_CLIENT_ALLOWED = [
  "db/**/*.{ts,tsx}",
  "lib/data/**/*.{ts,tsx}",
  "lib/auth/server.ts",
  "lib/auth/session.ts",
  "lib/auth/setup-token.ts",
]

/**
 * The S3 handle is fenced for the same reason the Drizzle handle is.
 *
 * `lib/storage/document-store-s3.ts` builds an `S3Client` scoped to the whole
 * documents bucket — every organization's files. Reached from a route it is a
 * bucket-wide handle with no `OrgScope` anywhere in the call, which is exactly
 * the seam bypass the DB fence exists to prevent, with a longer tail: a
 * mis-scoped row renders one wrong page, a mis-scoped object hands over a file.
 *
 * `lib/storage/store.ts` (the process-wide resolver) is on the allowlist so the
 * data layer imports the seam, never the implementation. Same severity caveat
 * as the DB fence: `eslint-plugin-only-warn` makes this advisory, and
 * `lib/storage/s3-fence.boundary.test.ts` is the blocking half.
 */
const RAW_S3_CLIENT = {
  group: [
    "@/lib/storage/document-store-s3",
    "**/lib/storage/document-store-s3",
    "@aws-sdk/client-s3",
    "@aws-sdk/lib-storage",
  ],
  message:
    "The S3 client is fenced to lib/storage/**. Data modules take the seam from lib/storage/store.ts (documentStore()); routes take neither — they call lib/data/documents.ts. See apps/beta/lib/storage/document-store.ts.",
}

const S3_CLIENT_ALLOWED = ["lib/storage/**/*.{ts,tsx}"]

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [UI_BLOCK_INTERNALS, RAW_DB_CLIENT, RAW_S3_CLIENT] },
      ],
    },
  },
  {
    files: DB_CLIENT_ALLOWED,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [UI_BLOCK_INTERNALS, RAW_S3_CLIENT] },
      ],
    },
  },
  {
    files: S3_CLIENT_ALLOWED,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [UI_BLOCK_INTERNALS, RAW_DB_CLIENT] },
      ],
    },
  },
]
