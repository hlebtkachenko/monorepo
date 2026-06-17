# Secrets Management 101 — for a Fintech SaaS

> **Migration status (2026-05-22 → 2026-06):** the Afframe secrets stack is
> moving from AWS Secrets Manager (today) to Vault-on-VPS + AWS SSM SecureString.
> See [`SECRETS-MIGRATION.md`](SECRETS-MIGRATION.md) for the active plan and
> [`../runbooks/VAULT-OPS.md`](../runbooks/VAULT-OPS.md) for the operational
> runbook. Sections of this primer that reference SOPS+age describe a path the
> repo evaluated but did NOT adopt; treat them as historical context, not
> instructions.

> Reference primer for understanding secrets management in a fintech / SaaS
> context. Grounded in the Afframe monorepo's actual stack. Saved here so
> future contributors (human or AI) can read once and orient.
>
> See also:
>
> - [`SECRETS-MIGRATION.md`](SECRETS-MIGRATION.md) — the active 2026 migration plan
> - [`docs/runbooks/SECRETS.md`](../runbooks/SECRETS.md) — the project's actual secrets convention
> - [`docs/runbooks/VAULT-OPS.md`](../runbooks/VAULT-OPS.md) — Vault operations runbook
> - [`docs/env-vars.md`](../env-vars.md) — registry of every env var the app reads
> - [`docs/runbooks/AWS-SETUP.md`](../runbooks/AWS-SETUP.md) — deploy wiring chain
> - `.gitleaks.toml` — leak-detection rules at the repo root

---

## 1. What counts as a "secret"

A secret is **data that grants access to something**. Not all sensitive data is a secret — secrets are specifically the keys to doors. Useful to keep this clear because rotation, storage, and access rules differ for each category.

| Category                 | Example in your stack                                                  | If it leaks, what happens?                                                              |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Secret**               | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, AWS access key | Attacker can read data / impersonate users / send email as you / spend your money       |
| **Config**               | `PORT=3000`, `NODE_ENV=production`, `LOG_LEVEL=info`                   | Nothing breaks — just behavior                                                          |
| **PII** (personal info)  | User emails in DB, IP addresses in logs                                | GDPR breach reportable in 72h, but no system access gained                              |
| **Public identifier**    | `AWS_REGION`, `BUILD_SHA`, `APP_DOMAIN`                                | Nothing — these are public anyway                                                       |
| **Sensitive-but-public** | AWS account ID, role ARNs (contain account ID)                         | Mild — reveals architecture; not a credential itself. Some orgs treat as secret anyway. |

## 2. Types of secrets your project will accumulate

Real categories you already have or will soon:

| Type                                     | Examples (yours)                                        | Sensitivity     | Lifetime expectation                                                    |
| ---------------------------------------- | ------------------------------------------------------- | --------------- | ----------------------------------------------------------------------- |
| **Database credentials**                 | RDS master password, `app_user` password                | 🔴 critical     | Rotate every 90 days (automated by AWS Lambda is best)                  |
| **Session signing keys**                 | `BETTER_AUTH_SECRET`, future `JWT_SECRET`               | 🔴 critical     | Rotate only on suspected compromise (rotation invalidates all sessions) |
| **External SaaS API keys**               | `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `LINEAR_API_KEY` | 🟠 high         | Quarterly manual rotation, or on compromise                             |
| **Webhook signing secrets**              | `whsec_...` (Standard Webhooks format)                  | 🟠 high         | Annual rotation, coordinated with consumer                              |
| **Your own API keys issued to partners** | `affk_live_...`, `affk_test_...`                        | 🟠 high         | Per-customer, customer-controllable                                     |
| **Tunnel / connectivity tokens**         | `CLOUDFLARE_TUNNEL_TOKEN_*`                             | 🟠 high         | Rotate annually or on compromise                                        |
| **OAuth client secrets**                 | Google/GitHub OAuth (when you add SSO)                  | 🟠 high         | Annual rotation                                                         |
| **Personal Access Tokens (PATs)**        | `LINEAR_API_KEY`, GitHub PAT (avoid these — use Apps)   | 🟡 medium       | Die with the human owner                                                |
| **Workload identity credentials**        | ECS task role, GitHub Actions OIDC                      | 🟢 ephemeral    | Auto-rotated by cloud provider (1-12h TTL) — best class                 |
| **Encryption keys (for other secrets)**  | `ENCRYPTION_KEY` for Infisical, KMS CMK                 | 🔴 catastrophic | Rotate annually, plan re-encryption ceremony                            |
| **SSH keys**                             | VPS SSH key                                             | 🟠 high         | Replace on departure / device loss                                      |
| **DKIM / DMARC keys**                    | Email signing keys at Resend                            | 🟡 medium       | Annual rotation aligned with Resend                                     |

## 3. Format conventions — why secrets have funny prefixes

Modern services prefix their secrets so leak-detection tools (GitLeaks, GitHub Secret Scanning, TruffleHog) can spot them in committed code or logs. Memorize the common ones:

| Prefix                      | Issuer                    | What it is                                      |
| --------------------------- | ------------------------- | ----------------------------------------------- |
| `sk_live_` / `sk_test_`     | Stripe                    | Secret key (live / test mode)                   |
| `pk_live_` / `pk_test_`     | Stripe                    | Publishable key (safe to expose)                |
| `whsec_`                    | Stripe, Standard Webhooks | Webhook signing secret                          |
| `sk-ant-api03-`             | Anthropic                 | API key                                         |
| `sk-proj-`                  | OpenAI                    | Project-scoped API key                          |
| `re_`                       | Resend                    | API key                                         |
| `ghp_`                      | GitHub                    | Personal access token                           |
| `ghs_`                      | GitHub                    | Server-to-server token                          |
| `gho_`                      | GitHub                    | OAuth access token                              |
| `glpat-`                    | GitLab                    | Personal access token                           |
| `xoxb-` / `xoxp-`           | Slack                     | Bot / user OAuth token                          |
| `AKIA`                      | AWS                       | Long-term IAM access key ID (avoid using these) |
| `ASIA`                      | AWS                       | Short-term STS access key ID (good)             |
| `affk_live_` / `affk_test_` | **Afframe** (ADR-0023)    | Public API key                                  |
| `afkey-`                    | **Afframe** (ADR-0022)    | Internal opaque auth token                      |

A high-entropy secret has at minimum **128 bits of randomness** (≈22 random base62 chars or 32 hex chars). Anything shorter is brute-forceable.

## 4. Where secrets live — storage tiers

Each tier has different threat model, audit story, and rotation tooling. Match the tier to the secret's lifecycle.

| Tier                                | Where                                                          | Good for                                          | Bad for                               | Afframe usage                                                 |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| **Source code** (never)             | `.ts`, `.py`, `Dockerfile`, `compose.yml`                      | —                                                 | Everything                            | Gitleaks blocks                                               |
| **Encrypted-in-git**                | SOPS+age YAML committed to repo                                | Dev/staging shared secrets, small team            | Production runtime, frequent rotation | Not adopted (SOPS+age evaluated, never adopted)               |
| **Local `.env`**                    | `apps/web/.env.local` (gitignored)                             | Developer's own machine                           | Anything shared                       | `scripts/generate-env.sh` produces this                       |
| **Secrets manager (cloud)**         | AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault Cloud | Production runtime, audit-required                | Tiny static configs                   | Currently: AWS SM for `monorepo-{env}-*`                      |
| **Secrets manager (self-hosted)**   | Infisical, OpenBao, Vault OSS                                  | Same as cloud but no per-secret fee               | Heavy ops if you scale                | Adopted: Vault OSS on self-hosted Hostinger VPS               |
| **Parameter store**                 | AWS SSM Parameter Store                                        | Non-secret config + SecureString secrets          | Heavy rotation, frequent reads        | Currently: OpenFGA store/model IDs; future: most SecureString |
| **Cloud KMS / HSM**                 | AWS KMS, GCP KMS, AWS CloudHSM                                 | Encryption keys (keys that encrypt other secrets) | Application secrets directly          | Defaults under the hood                                       |
| **Password manager**                | 1Password, Bitwarden                                           | Human-shared credentials, recovery codes          | Machine-consumed runtime              | Laptop, age private key backup, MFA recovery codes            |
| **CI/CD platform**                  | GitHub Actions secrets, GitLab CI variables                    | Deploy-time credentials                           | Application runtime                   | `gh secret` set values                                        |
| **Environment variable at runtime** | Process env injected by orchestrator                           | The actual consumption layer                      | Long-term storage                     | ECS task `secrets:` block injects from SM/SSM into env        |

## 5. Distribution — how a secret reaches the code that needs it

Five common patterns, ordered from worst to best:

| Pattern                                  | Description                                                                                                                          | When acceptable                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **A. Hardcoded in source**               | `const KEY = "sk_live_..."`                                                                                                          | Never                                                    |
| **B. `.env` shipped in image**           | Built into Docker image's `/app/.env`                                                                                                | Never in production. Maybe dev.                          |
| **C. Env var via orchestrator**          | ECS task definition has `secrets:` block that pulls from AWS SM at task start; secret lands in `process.env.X`                       | Standard production pattern (Afframe today)              |
| **D. Workload identity → fetch on boot** | App authenticates to secrets manager using its workload identity (ECS task role / K8s SA / OIDC), fetches secrets, populates own env | Best production pattern; eliminates static "secret zero" |
| **E. Streaming sidecar**                 | A sidecar agent watches the secrets manager and rewrites env vars / files when secrets change; main app reloads                      | Heavy rotation, can't accept restart cost                |

Afframe AWS ECS today uses **pattern C**. With Vault (→ SSM SecureString) in place, a future Phase 4 could move to **pattern D** for fully-elegant secret-zero elimination. Pattern E only needed if you start rotating frequently.

## 6. Rotation — when and how often

| Secret                           | Recommended cadence                        | Method                                                             | Notes                                                                                                                                               |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| RDS database master              | 90 days                                    | AWS Secrets Manager + native Lambda rotation                       | Automated, free, dual-phase                                                                                                                         |
| Application DB user (`app_user`) | 90 days or never (until you have a reason) | Manual or scripted                                                 | Coordinated with apps                                                                                                                               |
| Better Auth signing key          | Only on compromise                         | Manual + accept all-users-logged-out                               | Rotation = mass logout AND permanently bricks all enrolled TOTP + backup codes (encrypted with this secret) — see `../runbooks/SECRETS-ROTATION.md` |
| Resend API key                   | Quarterly                                  | Manual: new key in Resend dashboard → update secret store → deploy | Resend doesn't auto-rotate                                                                                                                          |
| Anthropic API key                | Quarterly or annual                        | Manual                                                             | Same as Resend                                                                                                                                      |
| Cloudflare Tunnel token          | Annual or on compromise                    | Cloudflare dashboard → new token → update                          | Easy                                                                                                                                                |
| GitHub PATs                      | When user leaves                           | Delete user → token dies                                           | Never use PATs in production CI — use GitHub Apps                                                                                                   |
| AWS IAM access keys (avoid)      | Don't use; use OIDC roles                  | —                                                                  | The only "rotation" is "stop using them"                                                                                                            |
| STS / workload identity tokens   | Auto every 1-12 hours                      | Cloud provider does it                                             | You don't manage                                                                                                                                    |
| Encryption keys (KMS)            | Annual rotation enabled at creation        | KMS automates                                                      | Old versions kept for decrypt                                                                                                                       |
| Webhook signing secrets          | On compromise + annual                     | Coordinated with partner                                           | Dual-phase if possible                                                                                                                              |

**Two phases of rotation**:

- **Single-phase**: old key invalid the moment new one is created. Risk: any consumer that hasn't updated yet breaks. Use for "we know nobody else holds this" cases.
- **Dual-phase**: both old + new valid for a transition window (hours to days). Consumers update, then old key dies. Use for shared / external-facing secrets. AWS Secrets Manager rotation lambda implements dual-phase by default for RDS.

## 7. Static vs ephemeral credentials

| Property             | Static                           | Ephemeral                                                |
| -------------------- | -------------------------------- | -------------------------------------------------------- |
| **Lifetime**         | Days to years                    | Minutes to hours                                         |
| **Where stored**     | Disk somewhere                   | Memory of issuing system                                 |
| **If leaked**        | Damage until you rotate          | Damage until expiry                                      |
| **Examples**         | AWS access key, GH PAT, API keys | STS token, JWT with short exp, GH App installation token |
| **Setup cost**       | Low                              | Medium (need OIDC / IAM / Vault setup)                   |
| **Operational cost** | Rotation overhead                | None (auto-expire)                                       |

**Industry norm**: replace static credentials with ephemeral ones wherever the technology permits. For Afframe:

| Currently static           | Move to ephemeral how?                           |
| -------------------------- | ------------------------------------------------ |
| AWS access keys for deploy | Already done — GitHub Actions OIDC → AssumeRole  |
| GitHub Actions → Vault     | M5 (shipped) — GitHub OIDC JWT → Vault JWT auth  |
| ECS → AWS SM               | Already done — task role grants `GetSecretValue` |
| ECS → Vault-fed SSM        | Vault AWS IAM Auth (vault-to-ssm-sync)           |

## 8. Top anti-patterns (and why your project avoids them)

| Anti-pattern                               | Why bad                                            | Afframe defense                                   |
| ------------------------------------------ | -------------------------------------------------- | ------------------------------------------------- |
| Secret in source code                      | Public repo = instant breach                       | `.gitleaks.toml` blocks at commit time + CI       |
| Secret in Docker image                     | Image layers cached forever; anyone who pulls sees | Use `secrets:` block in compose / task def        |
| Same secret across envs                    | Dev breach = prod breach                           | Per-env secrets in Secrets Manager/Infisical      |
| Plaintext in Slack/Notion                  | Not encrypted at rest, audit trail unclear         | 1Password for sharing                             |
| Static AWS keys in CI                      | Long-lived, leakable                               | OIDC + AssumeRole                                 |
| Logging secret value at startup            | Logs end up in 3 more places                       | Code review + grep before merge                   |
| Treating PII like a secret (or vice versa) | Different governance                               | Conscious distinction in CLAUDE.md                |
| Putting secrets in URL query strings       | Web server logs capture URLs                       | Header / body only                                |
| Reusing webhook secret across consumers    | One leak = all impersonatable                      | Per-consumer secrets                              |
| Embedded private key in test fixtures      | Real keys get committed by accident                | gitleaks allowlist for `__fixtures__/` paths only |
| Forgetting to delete a key after rotation  | Multiple valid keys = wide attack surface          | Rotation procedure: new → propagate → delete old  |

## 9. Standards & regulations relevant to Afframe

Czech accounting SaaS — EU jurisdiction, fintech-adjacent. These frame the secrets policy:

| Standard                  | Scope                                       | Secret-relevant requirement                                                                      |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **GDPR**                  | EU personal data                            | If a secret protects PII, breach must be notified within 72h. Document who can access.           |
| **DORA** (EU, 2025)       | Financial services ICT resilience           | Document third-party ICT risk (every SaaS API key you hold). Audit log of access.                |
| **PCI-DSS**               | Card data (if you ever handle card numbers) | Rotate encryption keys at least annually. Role-based access. Quarterly access review.            |
| **SOC 2 Type II**         | Service organization controls               | Audit trail of secret access for 6-12 months. Documented rotation cadence. Provable enforcement. |
| **ISO 27001**             | General InfoSec                             | Documented secrets policy. Periodic review. Risk assessment.                                     |
| **NIST SP 800-57**        | Cryptographic key management                | Key lifecycle: generate → distribute → use → archive → destroy. Reference for cipher choices.    |
| **Czech-specific (ÚOOÚ)** | National GDPR DPA                           | Mostly follows GDPR; reportable breach procedure.                                                |

Practical implication for solo dev today: **maintain an audit trail** (Infisical's built-in one + AWS CloudTrail) and **document rotation cadence** in a runbook. Auditors will ask both questions when you raise / go enterprise.

## 10. Common concepts — glossary

| Term                      | Meaning                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Secret zero**           | The first credential needed to bootstrap. Solving it = how does the secrets manager itself authenticate? Modern answer: cloud workload identity (ECS task role, K8s SA, etc.) |
| **KMS**                   | Key Management Service — cloud-managed encryption key store. Encrypts other secrets.                                                                                          |
| **HSM**                   | Hardware Security Module — physical chip for keys. Tamper-resistant. AWS CloudHSM, Azure HSM.                                                                                 |
| **CMK**                   | Customer Master Key — KMS key you control vs the cloud-provided default key                                                                                                   |
| **DEK / KEK**             | Data Encryption Key / Key Encryption Key — DEK encrypts data, KEK encrypts DEK. Envelope encryption pattern.                                                                  |
| **OIDC**                  | OpenID Connect — token-based identity federation. GitHub Actions → AWS = OIDC.                                                                                                |
| **STS**                   | AWS Security Token Service — issues short-lived AWS credentials                                                                                                               |
| **AssumeRole**            | STS operation: "let me act as this IAM role"                                                                                                                                  |
| **JWT**                   | JSON Web Token — signed token with claims. Common for session + auth tokens.                                                                                                  |
| **RBAC**                  | Role-Based Access Control — "user X belongs to role Y, can access secret Z"                                                                                                   |
| **ABAC**                  | Attribute-Based Access Control — finer than RBAC, conditional ("if request comes from prod env")                                                                              |
| **TTL**                   | Time To Live — credential expiry duration                                                                                                                                     |
| **Vault**                 | HashiCorp's product OR generic term for any secrets store                                                                                                                     |
| **Dynamic secrets**       | Generated on demand by the secrets manager, expire automatically (e.g. Vault provisions a 1-hour DB user)                                                                     |
| **Sealed secrets**        | Pattern: secret encrypted with cluster-public-key, only cluster's private key can decrypt. K8s pattern.                                                                       |
| **MFA / 2FA**             | Multi-Factor Authentication — second factor beyond password                                                                                                                   |
| **TOTP**                  | Time-based One-Time Password — Google Authenticator, Authy. Standard for 2FA.                                                                                                 |
| **SSO**                   | Single Sign-On — one identity provider authenticates user for many services                                                                                                   |
| **SAML**                  | Older SSO protocol, enterprise-heavy                                                                                                                                          |
| **OAuth 2.0**             | Authorization framework (different from authentication). "Allow this app to act on my behalf."                                                                                |
| **PKCE**                  | Proof Key for Code Exchange — OAuth 2.0 extension preventing certain attacks                                                                                                  |
| **mTLS**                  | Mutual TLS — both client AND server present certificates. Strong machine-to-machine auth.                                                                                     |
| **Audit log**             | Record of every secret read/write/access — required by SOC 2, DORA                                                                                                            |
| **Break-glass procedure** | Documented emergency access path when normal auth is broken                                                                                                                   |
| **Zero-trust**            | Architecture principle: no implicit trust based on network location                                                                                                           |
| **Defense in depth**      | Multiple overlapping security layers; one failure ≠ breach                                                                                                                    |
| **Blast radius**          | What an attacker accesses if they compromise one component                                                                                                                    |

## 11. Bonus — the lifecycle of one secret

Concrete example: Afframe's `RESEND_API_KEY` for sending email.

1. **Creation**: log into resend.com, click "Create API Key", copy the value `re_abc123...`
2. **Storage at rest**: source of truth is HashiCorp Vault on the VPS (`platform/{env}/resend-api-key`, KV-v2, encrypted at rest via KMS auto-unseal). A systemd timer mirrors it to AWS SSM SecureString (`/monorepo/{env}/resend-api-key`) as a runtime read-cache for ECS. One authoritative copy, one cache — no scattered duplicates.
3. **Distribution**: `vault kv put` → `vault-to-ssm-sync` timer (≤5 min) writes SSM → CDK task def references the SSM param via `EcsSecret.fromSsmParameter` → ECS injects into container env as `RESEND_API_KEY` → `packages/email` reads `process.env.RESEND_API_KEY` and calls `new Resend(key)`
4. **Use**: app sends email, Resend API validates the key against their database, sends the email
5. **Rotation**: create new key in Resend dashboard → `vault kv put platform/{env}/resend-api-key value=<new>` → sync writes SSM ≤5 min → `aws ecs update-service --force-new-deployment` rolls a task with the new value → verify email works → revoke old key in Resend dashboard. (See `docs/runbooks/SECRETS-ROTATION.md`.)
6. **Death**: when you stop using Resend or get compromised → mark key inactive in Resend, `vault kv delete` the path, let the sync remove it from SSM

Tracing this for every secret you have is the operational discipline. Infisical (or any secrets manager) collapses the storage tier from 3 places to 1.

---

## Where to read more

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [NIST SP 800-57](https://csrc.nist.gov/projects/cryptographic-key-management) — key management lifecycle (technical, dense)
- [`.gitleaks.toml`](../../.gitleaks.toml) — practical view of what patterns matter to Afframe
- [`docs/runbooks/SECRETS.md`](../runbooks/SECRETS.md) — what the project actually chose
- [`docs/env-vars.md`](../env-vars.md) — the registry of every env var the app reads
