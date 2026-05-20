# `afframe` CLI

Official command-line client for `api.afframe.com/v1`.

> **Status**: `0.0.1` — internal/preview. v1.0 ships on Homebrew tap + signed GitHub Releases binaries (see [`docs/api/CLI.md`](../../docs/api/CLI.md)).

## Install (dev)

From the monorepo root:

```bash
pnpm install
pnpm --filter @afframe/cli build
node apps/cli/dist/cli.js --help
```

Or `pnpm --filter @afframe/cli dev <command>` for tsx-driven dev runs.

## Commands

| Command              | Purpose                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `afframe login`      | Paste an API key, validate via `GET /v1/ping`, write `~/.config/afframe/config.toml` (mode 0600). |
| `afframe logout`     | Clear the active profile.                                                                         |
| `afframe whoami`     | Resolve the principal — confirm the configured key still authenticates.                           |
| `afframe ping`       | `GET /v1/ping` — pretty-print the JSON.                                                           |
| `afframe api <path>` | Raw GET against an arbitrary `/v1/*` path. Mirrors `gh api`.                                      |

`afframe login --api-key <key>` is the non-interactive form (CI, scripted setup). `AFFRAME_API_KEY` env works the same way.

## Configuration

- `AFFRAME_API_KEY` — overrides the configured profile's key.
- `AFFRAME_API_BASE` — overrides the base URL (default `https://api.afframe.com`).
- `AFFRAME_PROFILE` — selects a named profile (default `default`).

Profiles let you keep `default` (production) and `staging` side by side:

```bash
afframe --profile staging login --base-url https://api-staging.afframe.com
AFFRAME_PROFILE=staging afframe whoami
```

## Exit codes

| Code  | Meaning                                                  |
| ----- | -------------------------------------------------------- |
| `0`   | Success                                                  |
| `1`   | User error (missing key, bad input, 4xx response)        |
| `2`   | Server / IO error (5xx, unreachable, JSON parse failure) |
| `130` | SIGINT                                                   |

Follows [clig.dev](https://clig.dev/).

## What's missing (v0.1 → v1.0)

- Webhook tooling: `afframe listen`, `afframe trigger`.
- Resource ops with `--json` / `--jq` / `--template`.
- Migration to oclif when plugin / completion stories matter.
- Homebrew tap + signed binaries.

Full design + roadmap: [`docs/api/CLI.md`](../../docs/api/CLI.md).
