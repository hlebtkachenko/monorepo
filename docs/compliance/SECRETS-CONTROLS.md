# Secrets-Management Controls — SOC 2 / DORA mapping

> **Status:** placeholder — finalized in M10 of [`docs/plans/SECRETS-MIGRATION.md`](../plans/SECRETS-MIGRATION.md) once
> the full Vault + AWS SSM SecureString chain is live.
>
> **Backs:** [AFF-245](https://linear.app/hapddev/issue/AFF-245).
>
> **Purpose:** map every secrets-handling control we claim to the SOC 2
> Trust-Services Criteria and DORA Articles. Used during audit prep and as the
> source of truth for the Statement of Applicability.

## Mapping outline (to be filled in M10)

### SOC 2 Trust-Services Criteria

| Control                                                | Where it's implemented                                                      | Evidence                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------- |
| CC6.1 — Logical access controls                        | Cloudflare Access (operators) + Vault AWS IAM Auth (workloads) + Vault OIDC | Cloudflare Zero Trust audit log; Vault audit device |
| CC6.6 — Logical access removed when no longer required | Vault policy revocation; Cloudflare Access group sync from Google Workspace | Vault audit device; Workspace user lifecycle log    |
| CC7.1 — Detection of vulnerabilities                   | gitleaks + infisical-scan (pre-commit + CI); GitHub Dependabot              | gitleaks job logs; CI workflow runs                 |
| CC7.2 — Response to security incidents                 | [`docs/runbooks/INCIDENT.md`](../runbooks/INCIDENT.md); SECRETS-ROTATION.md | Incident retros                                     |
| CC8.1 — Change management                              | PR review + Vault audit device captures every secret read/write             | Vault audit log; GitHub PR history                  |

### DORA (EU Regulation 2022/2554)

| Article | Topic                         | Where it's implemented                                                                                  |
| ------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Art. 6  | ICT risk management framework | This plan + the irreversible-ops register                                                               |
| Art. 9  | Protection & prevention       | Vault encryption at rest; KMS-wrapped DEK; audit device                                                 |
| Art. 10 | Detection                     | Vault audit log; CloudTrail on KMS + SM + SSM; Resend bounce alerts                                     |
| Art. 11 | Response & recovery           | DR drill (M2); rotation drill (M10); backup to 2 unrelated providers                                    |
| Art. 28 | Third-party risk              | Vault on Hostinger (compute) ≠ AWS (runtime) ≠ Cloudflare (network); concentrations split intentionally |

### Risk acceptance

The following risks are explicitly accepted at current scale:

- **Single-node Vault** — no HA cluster today; mitigated by 6-hour backups + restored DR drill RTO ≤30 min.
- **Single-operator escrow** — Shamir keys controlled by one person. Mitigated by paper-at-safe-deposit + Keychain split. Adding a second escrow operator is tracked in [AFF-245](https://linear.app/hapddev/issue/AFF-245)'s post-100-clients section.
- **File-based audit device** — local log on VPS. Mitigated by 13-month retention deferral until SOC 2 ([AFF-244](https://linear.app/hapddev/issue/AFF-244)).

## Open items before SOC 2 Type II

- Centralized audit-log shipping ([AFF-244](https://linear.app/hapddev/issue/AFF-244))
- Second escrow operator
- HA Vault cluster (3 nodes; deferred)
- Dynamic DB secrets ([AFF-243](https://linear.app/hapddev/issue/AFF-243))
