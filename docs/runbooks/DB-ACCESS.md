# Operator DB access (staging / production)

RDS lives in a private subnet — no public endpoint. Two operator paths, pick by
task:

| Need                                                                     | Tool                                 | Cost      |
| ------------------------------------------------------------------------ | ------------------------------------ | --------- |
| **Read / quick query** (who's a user, is X allowlisted, counts)          | **`scripts/db-query.sh`**            | **~2-3s** |
| **Raw write SQL from a laptop** (migrations, ad-hoc DDL, a `psql` shell) | `scripts/staging-bastion-migrate.sh` | ~3-4 min  |

Both need: AWS creds for the account (`export AWS_PROFILE=<profile>`; confirm with
`aws sts get-caller-identity`), the `session-manager-plugin`, and a target env
that is **not cold-paused** (a running task / resumed RDS).

## Fast reads — `db-query.sh` (ECS Exec, ~2s)

Runs a one-shot `node` query **inside the already-running `api` container**
(in-VPC) via `aws ecs execute-command`. No EC2, no tunnel, no laptop↔RDS hop.
The `api` container ships the `postgres` driver and the DB connection **parts**
(`DB_DIRECT_HOST`, `DB_USER`, `DB_PASSWORD`, …) as env vars — the helper composes
the connection there (the entrypoint-composed `DATABASE_URL` is absent from an
exec shell), runs your SQL, prints JSON. The password is read from the container
env and **never printed or transited through your laptop**.

```bash
./scripts/db-query.sh production "SELECT email, role FROM app_user ORDER BY created_at"
./scripts/db-query.sh staging    "SET ROLE app_admin; SELECT * FROM admin_workspace_allowlist"
```

- **RLS-forced tables** (membership, allowlist, anything tenant-scoped): prefix
  `SET ROLE app_admin;`. The api role (`app_user`) is a member of `app_admin`
  (BYPASSRLS) per migration `0002_auth.sql`. Plain global tables (`app_user`)
  need no role switch.
- Connects on the **direct** RDS endpoint with prepared statements off, so
  multi-statement / DDL / `SET ROLE` all behave.
- It runs whatever SQL you pass — treat it like a prod `psql` prompt.

### Security

No internet surface: gated by AWS IAM (`ecs:ExecuteCommand`) + SSM, every session
in CloudTrail. The real boundary is **who holds an AWS credential with
`ecs:ExecuteCommand`** — that grants an in-container shell (can read all env
secrets). Keep that IAM permission to a small set of principals.

## Raw write SQL — `staging-bastion-migrate.sh` (bastion, ~3-4 min)

For things `db-query.sh` can't do from a laptop: applying migrations, a real
interactive `psql`, bulk DDL. Spins an ephemeral EC2 + SSM port-forward to RDS,
runs `CMD`, then tears down every resource it created.

```bash
./scripts/staging-bastion-migrate.sh production                       # default: db:migrate
CMD='psql "$DATABASE_DIRECT_URL"' ./scripts/staging-bastion-migrate.sh production
```

Overrides: `BASTION_INSTANCE_TYPE` (default `t4g.nano`), `BASTION_LOCAL_PORT`
(default `5433`, to dodge a local Postgres/Docker on `5432`). It auto-retries
across public subnets when an AZ has no capacity and waits for the tunnel to
actually open before running — but it's still a heavy hack; prefer `db-query.sh`
for anything that isn't a write.
