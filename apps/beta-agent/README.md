# `beta-agent` — office-side agent for the Afframe beta portal

The accountant's end of the **Měsíční uzávěrka** ritual (beta spec §3.2). It reads
the office's own exports, transforms them, and publishes them to the portal's
agent ingestion API. The portal never touches Money S3 and never computes: every
number it shows came from a file the office exported and this tool posted.

It is **office-side only**. It is never installed by a client, never reachable
from a browser, and holds the agent key in one environment variable for the
lifetime of one command.

## ⚠️ Assumptions that still need a real Money S3 export

**No real Money S3 export file existed when this was written** — it is a HARD
INPUT still owed by the office. Everything here was built against the documented
contract of the portal's own manual CSV fallback plus the self-authored files in
[`examples/`](examples). The parser layer is deliberately thin and swappable; the
full list of what a real export can invalidate is the header comment of
[`src/datasets.ts`](src/datasets.ts) (A1–A6), and the short version is:

| #   | Assumption                                                        | What breaks it                                             |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| A1  | Header spellings in `*_ALIASES`                                   | Money S3 prints other words, or no header row              |
| A2  | Czech enum labels (`DPH přiznání`, `Stroj`, `v užívání`, …)       | An export using numeric codes                              |
| A3  | One file = one dataset                                            | A workbook with several sheets, or rozvaha+VZZ in one file |
| A4  | A stable `ID` column per registry row                             | No stable identifier ⇒ re-runs would duplicate a register  |
| A5  | Period as `2026-07` / `2026-Q3` / `2026`                          | Another period notation                                    |
| A6  | `31.7.2026` or `2026-07-31` dates; `paid_at` widened to 12:00 UTC | Another date format                                        |

Only the three statement datasets (`predvaha`, `rozvaha`, `vzz`) are safe from
A1/A2: their alias tables are copied verbatim from the portal's own fallback, so
the agent and the drag-and-drop path accept the same files by construction.

## Running it

Requires the monorepo checkout and `pnpm install`. There is no build step and no
binary: the CLI runs from source through `tsx`, the same way this repo's other
operator scripts do.

```bash
export BETA_AGENT_URL="https://beta.afframe.com"
export BETA_AGENT_KEY="afb_agent_..."

pnpm exec tsx apps/beta-agent/src/cli.ts check
pnpm exec tsx apps/beta-agent/src/cli.ts datasets
pnpm exec tsx apps/beta-agent/src/cli.ts publish predvaha \
  --file ~/Exporty/2026-07/predvaha.csv --org stavby-vltava --period 2026-07
```

Add `--dry-run` to transform and print the exact request body without sending
anything. Dry runs need **no** credentials, so a Money S3 export can be validated
before a key is ever issued.

| Command             | What it does                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `check`             | `GET /api/agent/v1/meta` — is the key live, which firms does it reach, which datasets does this deployment accept |
| `datasets`          | The local dataset matrix, offline                                                                                 |
| `publish <dataset>` | Transform a CSV and post it. `--file`, `--org`, `--period`, `--dry-run`, `--idempotency-key`                      |

Exit codes: `0` success · `1` the office must change something (bad file, bad
flag, missing variable, 4xx) · `2` the portal or the network is at fault (5xx,
unreachable).

## Dataset matrix

| Dataset        | Source export                    | Endpoint                      | Period                   |
| -------------- | -------------------------------- | ----------------------------- | ------------------------ |
| `predvaha`     | obratová předvaha                | `publish/trial-balance`       | `--period`               |
| `rozvaha`      | rozvaha                          | `publish/statements`          | `--period`               |
| `vzz`          | výsledovka                       | `publish/statements`          | `--period`               |
| `filings`      | office filing register           | `filings`                     | per row, else `--period` |
| `liabilities`  | residual obligations             | `liabilities`                 | —                        |
| `assets`       | majetek register                 | `assets`                      | —                        |
| `client-tasks` | office to-do list for the client | `client-tasks`                | —                        |
| `saldokonto`   | saldokonto per partner           | route live, **CLI not wired** | `--period`               |
| `payroll`      | mzdová rekapitulace              | route live, **CLI not wired** | `--period`               |

The last two transform and validate locally and still refuse to send anything:
the portal's `/api/agent/v1/orgs/{orgSlug}/publish/saldokonto` and
`.../publish/payroll` routes exist (items 28 and 30-32), but this CLI has no
request wiring for either yet — a follow-up, not a HARD INPUT. `--dry-run`
already prints the exact body that wiring would send.

## Idempotency

The `Idempotency-Key` is derived **per call**, never per run:
`sha256(endpoint + org + period + canonical body)`. The server's unique index
spans every endpoint and every book, so one id per run is refused with
`idempotency_key_reused` by design. Deriving from content means a retry after a
timeout is replayed instead of publishing a second superseding batch, while a
corrected file is a genuinely new act. Override with `--idempotency-key` to force
a re-publish of a byte-identical file. Full rationale:
[`src/idempotency.ts`](src/idempotency.ts).

## Vendored contract files

[`src/vendor/schemas.ts`](src/vendor/schemas.ts) and
[`src/vendor/csv.ts`](src/vendor/csv.ts) are **byte-identical copies** of
`apps/beta/lib/agent/schemas.ts` and `apps/beta/lib/import/csv.ts`. They are
copied rather than imported because `apps/beta` is a Next.js application with no
export map, and because both modules are the CONTRACT (the wire format, and the
parsing rules the portal applies to the same files) rather than an implementation
detail. Two gates keep them honest: `src/vendor/vendor.test.ts` compares bytes,
and `.github/related-files.yml` requires a PR touching either source to touch
this directory too. Never hand-edit them — re-copy.

Publishing runs the server's own zod schema locally before anything is sent, so a
payload that would come back as a `400` is refused while the operator still has
the file open.

## Security

- The key is read from `BETA_AGENT_KEY`, sent as `Authorization: Bearer`, and
  never written to stdout, an error, a dry-run body or a file. Tests assert this
  over every failure path.
- No config file and no keychain entry: one credential, one process lifetime.
- `BETA_AGENT_URL` must be `https`, except on loopback for a local portal.
