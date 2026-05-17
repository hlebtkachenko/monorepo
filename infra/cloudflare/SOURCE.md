# Vendored source: turborepo-remote-cache-cloudflare

The `src/` directory is vendored from
[`AdiRishi/turborepo-remote-cache-cloudflare`](https://github.com/AdiRishi/turborepo-remote-cache-cloudflare)
at tag **`v4.0.0`** (tag object SHA `0fe7730b047b889ab418e26d1160a7bf021bb2b5`,
released 2026-01-19).

License: MIT — see [LICENSE](./LICENSE).

## Why vendored, not npm

The upstream project ships as a Cloudflare Workers application, not an npm
package. There is no published `@adirishi/turborepo-remote-cache-cloudflare`
package on the npm registry (verified 2026-05-17). Vendoring is the supported
deployment path per the upstream README.

## What was vendored

| Path                 | Source                      | Modified?                                                                                                                 |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/` (entire tree) | upstream `src/`             | No — verbatim copy from v4.0.0                                                                                            |
| `LICENSE`            | upstream `LICENSE`          | No                                                                                                                        |
| `tsconfig.json`      | NEW — slimmed               | Yes — dropped vitest types + jsx config                                                                                   |
| `package.json`       | NEW — slimmed               | Yes — kept only runtime + minimal build deps; no vite, no vitepress, no upstream lint/test tooling                        |
| `wrangler.jsonc`     | NEW — written for this repo | Yes — `cache.afframe.com` custom-domain route (auto-DNS via Zone DNS:Edit), 14d cache TTL, `turbo-cache-prod` bucket name |

## Upgrade path

To bump to a new upstream release:

```bash
cd infra/cloudflare
# 1. Snapshot current diff first
git status

# 2. Re-extract upstream src/
curl -sSL "https://github.com/AdiRishi/turborepo-remote-cache-cloudflare/archive/refs/tags/v<NEW>.tar.gz" -o /tmp/turbo-cache-cf.tar.gz
rm -rf src/
tar -xzf /tmp/turbo-cache-cf.tar.gz --strip-components=1 turborepo-remote-cache-cloudflare-<NEW>/src

# 3. Review upstream CHANGELOG for breaking changes in:
#    - Env schema (src/index.ts `Env` type)
#    - R2 binding name (src/storage/r2-storage.ts)
#    - Route surface (src/routes/v8/artifacts.ts)
#    - Cron handler signature (src/crons/deleteOldCache.ts)

# 4. Bump dependencies in package.json if upstream pinned new majors:
#    hono, @hono/valibot-validator, valibot, wrangler, @cloudflare/workers-types

# 5. Test locally:
pnpm typecheck
pnpm dev  # localhost:8787 — hits in-memory KV by default
```

Update this file's version + SHA after every bump.

## What we removed and why

| Removed                                                  | Reason                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `.github/`, `.changeset/`, `.cursor/`                    | Upstream tooling, not needed in our monorepo                                                       |
| `tests/`, `vitest.config.ts`, `miniflare` deps           | Trust upstream's test coverage; we test integration via CI cache hits                              |
| `vite`, `vite-tsconfig-paths`, `@cloudflare/vite-plugin` | Wrangler v4 builds TypeScript Workers directly via esbuild; vite layer is upstream convention only |
| `vitepress`, docs/                                       | Upstream README is sufficient                                                                      |
| `eslint`, `prettier` plugins                             | Repo-level config in `packages/eslint-config` and root prettier covers this dir                    |
| `@trivago/prettier-plugin-sort-imports`                  | Repo standard prettier config does not use it                                                      |
| `changesets/`                                            | Upstream release tooling                                                                           |

## Security review (one-time, on v4.0.0)

- `src/index.ts` — entry point, instantiates `StorageManager(env)` per request. Bound R2 namespace `R2_STORE` is the only persistence surface.
- `src/routes/v8/artifacts.ts` — handles GET/PUT/HEAD on `/v8/artifacts/:hash`. Validates `Authorization: Bearer <TURBO_TOKEN>` per request.
- `src/storage/r2-storage.ts` — wraps R2 binding. No signed-URL generation; reads/writes go through Worker (auth gate enforced).
- No `eval`, no dynamic imports, no fetch to external URLs from the request path. Cron handler (`src/crons/deleteOldCache.ts`) only iterates R2 and calls `R2_STORE.delete()`.
- Cache integrity (HMAC-SHA256 signature) is verified client-side by the Turbo CLI, not by this Worker. See [Turborepo docs on remote cache signature](https://turborepo.dev/docs/core-concepts/remote-caching).
