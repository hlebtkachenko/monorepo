# Secrets-Management Controls — SOC 2 / DORA mapping

> **Status:** finalized 2026-05-31 (M10). The Vault → AWS SSM SecureString
> chain is live in staging + production; root token revoked; secret
> rotation drilled end-to-end (`RESEND_API_KEY`, Vault→SSM→ECS, verified
> in the running container); full git-history leak scan clean. The one
> control NOT yet evidenced is the **DR restore drill** (deferred,
> [AFF-247](https://linear.app/hapddev/issue/AFF-247)) — see the explicit
> caveat under Art. 11 + Risk acceptance. Do NOT claim a tested restore
> RTO until AFF-247 runs.
>
> **Backs:** [AFF-245](https://linear.app/hapddev/issue/AFF-245).
>
> **Purpose:** map every secrets-handling control we claim to the SOC 2
> Trust-Services Criteria and DORA Articles. Used during audit prep and as the
> source of truth for the Statement of Applicability.

## Mapping

### SOC 2 Trust-Services Criteria

| Control                                                | Where it's implemented                                                                                           | Evidence                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| CC6.1 — Logical access controls                        | Cloudflare Access (operators) + Vault AWS IAM Auth (workloads) + Vault OIDC                                      | Cloudflare Zero Trust audit log; Vault audit device  |
| CC6.6 — Logical access removed when no longer required | Vault policy revocation + Cloudflare Access email-allowlist removal (one-time-PIN IdP; no Google Workspace sync) | Vault audit device + Cloudflare Zero Trust audit log |
| CC7.1 — Detection of vulnerabilities                   | gitleaks + infisical-scan (pre-commit + CI); GitHub Dependabot                                                   | gitleaks job logs; CI workflow runs                  |
| CC7.2 — Response to security incidents                 | [`docs/runbooks/INCIDENT.md`](../runbooks/INCIDENT.md); SECRETS-ROTATION.md                                      | Incident retros                                      |
| CC8.1 — Change management                              | PR review + Vault audit device captures every secret read/write                                                  | Vault audit log; GitHub PR history                   |

### DORA (EU Regulation 2022/2554)

| Article | Topic                         | Where it's implemented                                                                                                                                                                                                                            |
| ------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 6  | ICT risk management framework | This plan + the irreversible-ops register                                                                                                                                                                                                         |
| Art. 9  | Protection & prevention       | Vault encryption at rest; KMS-wrapped DEK; audit device                                                                                                                                                                                           |
| Art. 10 | Detection                     | Vault audit log; CloudTrail on KMS + SM + SSM; Resend bounce alerts                                                                                                                                                                               |
| Art. 11 | Response & recovery           | **Rotation drill: DONE** (M10, 2026-05-31, end-to-end verified). **DR restore drill: NOT YET RUN** — deferred to [AFF-247](https://linear.app/hapddev/issue/AFF-247); restore RTO is therefore UNVERIFIED. Backup itself is live (restic→R2, 6h). |
| Art. 28 | Third-party risk              | Vault on Hostinger (compute) ≠ AWS (runtime) ≠ Cloudflare (network); concentrations split intentionally                                                                                                                                           |

### Risk acceptance

The following risks are explicitly accepted at current scale:

- **Single-node Vault** — no HA cluster today; mitigated by 6-hour restic backups to R2. **Restore RTO is a TARGET (≤30 min), not yet measured** — the DR drill that would verify it is deferred ([AFF-247](https://linear.app/hapddev/issue/AFF-247)).
- **Single-operator escrow** — 5 recovery keys (3-of-5 quorum) controlled by one person, held on **paper at safe-deposit** (proven working 2026-05-31: 3 keys regenerated root during the M3.5 cascade recovery). Daily admin is a 90-day Keychain operator-admin token. Adding a second escrow operator is tracked in [AFF-245](https://linear.app/hapddev/issue/AFF-245)'s post-100-clients section.
- **File-based audit device** — local log on VPS. Mitigated by 13-month retention deferral until SOC 2 ([AFF-244](https://linear.app/hapddev/issue/AFF-244)).

## Open items before SOC 2 Type II

- Centralized audit-log shipping ([AFF-244](https://linear.app/hapddev/issue/AFF-244))
- Second escrow operator
- HA Vault cluster (3 nodes; deferred)
- Dynamic DB secrets ([AFF-243](https://linear.app/hapddev/issue/AFF-243))
