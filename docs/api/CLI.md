# `afframe` CLI — Design

> **[Concept]** Not implemented. Tracked under the developer-platform initiative ([`ADR-0023`](../adr/0023-public-api-developer-platform.md)).

Reference design for the official command-line wrapper of `api.afframe.com/v1`. Targets accountant-developers on macOS first, Linux + Windows second.

---

## 1. Decisions

| Question             | Answer                                                                      | Why                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Language + framework | TypeScript + [oclif](https://oclif.io/)                                     | Same language as the monorepo, share `@workspace/shared` types, oclif gives plugins / completion / help / testing for free |
| Distribution         | Homebrew tap (primary) + GitHub Releases binaries (`pkg`-built)             | Mac-first audience, single-binary keeps Node out of accountants' machines. Skip global `npm i -g` (supabase's footgun).    |
| Repo location        | `apps/cli`                                                                  | Sits next to `apps/api`; imports `@workspace/shared` Zod types directly                                                    |
| Auth                 | API-key paste at launch                                                     | Stripe did this for years before adding OAuth pairing — don't block v1 on OAuth infra                                      |
| Config file          | `~/.config/afframe/config.toml`, mode `0600`                                | XDG-compliant, single key/active-profile + multi-profile support                                                           |
| Output               | Human pretty-print default, `--json` + `--jq` for scripting (gh-style)      | gh's `--json field1,field2 --jq '...'` is the industry-leading scripting story                                             |
| Exit codes           | clig.dev convention: `0` ok, `1` user error, `2` server error, `130` SIGINT | Standard, lets shell scripts branch correctly                                                                              |

---

## 2. Command taxonomy

### Auth — universal

- `afframe login` — prompts for `affk_live_` / `affk_test_` key, validates with `GET /v1/me` (concept), writes to config, sets `default` profile.
- `afframe logout` — clears the active profile.
- `afframe whoami` — prints `{ key_id, organization, workspace, scopes, mode: live|test }` — critical given our three-tier RLS.
- `afframe config set/get/list` — multi-profile (e.g., `--profile production`).

### Resource ops — universal **[Concept]**

Verb-as-subcommand, resource-as-noun. Mirrors REST.

```
afframe ping
afframe organization get
afframe invoices list [--status draft|sent|paid] [--limit N] [--cursor C]
afframe invoices get <id>
afframe invoices create --from-file invoice.json
afframe invoices finalize <id>
afframe journals list
afframe journals post <id>
afframe accounts list
afframe webhook-endpoints list/create/delete
afframe api-keys list/create/revoke
```

All accept `--json` for scripting and `--output table|json|yaml|csv`.

### Raw HTTP escape hatch — universal once API > 20 endpoints

```
afframe api -X GET /v1/invoices?status=draft
afframe api -X POST /v1/invoices --body @invoice.json
```

Mirrors `gh api`. Always available so the CLI doesn't bottleneck on new endpoints — the moment a route exists, you can hit it.

### Webhook tooling — ships with webhooks

```
afframe listen --forward-to http://localhost:3000/webhooks/afframe
afframe trigger invoice.paid [--scenario partial-overpayment]
```

`listen` opens a websocket against the API, streams events, prints the per-session signing secret (so the local handler can verify). `trigger` fires a canned fixture event in the sandbox org.

### Open in dashboard — nice-to-have

```
afframe open                          # dashboard root
afframe open invoice <id>             # deep link
afframe open dashboard:webhooks
```

### Shell completion — universal, cheap

```
afframe completion bash | zsh | fish
```

oclif emits these.

---

## 3. Auth flow

```text
$ afframe login

Paste an API key (affk_live_... or affk_test_...): ****
✓ Authenticated as principal=usr_01HXY... org=org_01HXY... workspace=ws_01HXY...
✓ Mode: TEST
✓ Wrote ~/.config/afframe/config.toml
```

- The key never appears in command output or history (read via TTY prompt; if non-TTY, require `--api-key`).
- File mode `0600` enforced.
- `AFFRAME_API_KEY` env var overrides the config file when set.
- `AFFRAME_PROFILE` switches active profile.
- A future `afframe login --browser` opens a device-code flow at `app.afframe.com/cli-pair` and provisions a scoped key — out of scope for v1.

---

## 4. Output

Default (TTY):

```
$ afframe invoices list --status draft
ID                        ISSUED      CUSTOMER             AMOUNT
inv_01HXY1...             2026-05-18  Acme s.r.o.          CZK  12 345,00
inv_01HXY2...             2026-05-19  Beta Ltd.            CZK  98 765,40
```

`--json`:

```
$ afframe invoices list --status draft --json id,issuedAt,total
[{"id":"inv_01HXY1...","issuedAt":"2026-05-18","total":{"amount":"1234500","currency":"CZK"}}]
```

`--jq` (embedded jq via `node-jq`):

```
$ afframe invoices list --json --jq '.[].id'
inv_01HXY1...
inv_01HXY2...
```

Auto-disable colours when stdout is not a TTY or `NO_COLOR` is set.

---

## 5. Versioning

The CLI semver is independent of the API path version (`/v1`).

- `afframe --version` prints `afframe 1.4.2 (api v1)`.
- A new `/v2` endpoint reaches the CLI as new commands; the CLI MINOR version bumps. Removing `/v1` after the Sunset triggers a CLI MAJOR.
- The auto-update nag (Vercel-style, gated by `--no-update-check`) prints once per day on stderr.

---

## 6. Distribution

```bash
# Homebrew (primary)
brew install afframe/tap/afframe

# Curl installer (mirrored to GitHub Releases)
curl -fsSL https://afframe.com/install.sh | sh

# Manual download
https://github.com/<org>/<cli-repo>/releases/latest
```

The binary is `pkg`-built and ships per-arch (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `windows-x64`). Signed with cosign (matches the supply-chain posture in `SECURITY.md`).

---

## 7. Build, test, release

- `apps/cli/package.json` private; oclif `pack:tarballs` + `pack:macos` + `pack:win` build artefacts.
- Unit tests via `@oclif/test`.
- Smoke test on each release: spin up a local API container, run `afframe whoami` against a test key.
- Release workflow `.github/workflows/cli-release.yml` (concept) gated on tag `cli-v*`. Produces signed tarballs + DEB + Brew formula PR.

---

## 8. Roadmap

| Milestone   | Scope                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| 0.1 (alpha) | `login`, `logout`, `whoami`, `config`, `api`, `open`. Internal use only.                 |
| 0.5 (beta)  | Resource ops for `/v1/invoices`, `/v1/journals`, `/v1/accounts`. JSON + jq + completion. |
| 0.9         | `listen`, `trigger` for webhooks. Homebrew tap public.                                   |
| 1.0         | First paying-partner-ready release. Signed binaries, autoupdate, documented support SLO. |

---

## 9. References

- [oclif](https://oclif.io/)
- [Stripe CLI](https://docs.stripe.com/stripe-cli) — auth + listen + fixtures patterns
- [gh CLI manual](https://cli.github.com/manual/) — JSON / jq / templates
- [Command Line Interface Guidelines (clig.dev)](https://clig.dev/)
- [`ADR-0023`](../adr/0023-public-api-developer-platform.md), [`SDK.md`](./SDK.md), [`MCP.md`](./MCP.md), [`WEBHOOKS.md`](./WEBHOOKS.md)
