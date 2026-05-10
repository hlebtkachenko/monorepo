# Security Policy

## Supported Versions

This monorepo is pre-release. Only `main` is supported. No backports.

## Reporting a Vulnerability

Do **not** open a public GitHub issue for security vulnerabilities.

Email **g1053015@icloud.com** with:
- Description of the issue
- Steps to reproduce
- Affected component (`apps/web`, `packages/ui`, `infra/`, CI workflow, etc.)
- Suggested mitigation if known

Acknowledgement target: 72 hours. Triage target: 7 days. Fix target depends on severity.

## Severity

| Severity | Examples | Response |
|----------|----------|----------|
| Critical | RCE, auth bypass, data exfiltration, secrets leak | Immediate triage, hotfix, public advisory |
| High | Privilege escalation, injection, supply-chain compromise of a build action | 7-day fix |
| Medium | DoS, info disclosure | Next release |
| Low | Hardening improvement | Backlog |

## Supply Chain

- All container images are signed via `cosign` keyless (Sigstore Rekor transparency log).
- SBOMs (CycloneDX 1.6) are produced for every build artifact via `syft`.
- SLSA L2 build provenance is attached to every artifact via `actions/attest-build-provenance`. Tagged releases additionally generate SLSA L3 via `slsa-framework/slsa-github-generator`.
- Verify a release artifact: see `docs/runbooks/SUPPLY-CHAIN-VERIFY-AT-DEPLOY.md`.
- Supply-chain incident playbook: `docs/runbooks/SUPPLY-CHAIN-INCIDENT.md`.

## CI Security Posture

- Default-deny `permissions: {}` on every workflow; per-job least privilege.
- Third-party actions SHA-pinned (Dependabot bumps via `github-actions` ecosystem).
- `step-security/harden-runner` runs in audit mode on every job; flip to `block` is tracked.
- `gitleaks` (secret scan), `codeql` (SAST), `osv-scanner` (CVE), `dependency-review` (PR diff), `actionlint` + `zizmor` (workflow lint), `trivy` (container scan when Dockerfile builds).

## AWS Posture (when connected)

- No IAM users for humans, ever. Identity Center + Google Workspace SAML.
- No long-lived AWS access keys. GitHub OIDC only, environment-scoped trust policies (NOT branch-scoped).
- Customer-managed KMS keys per data domain.
- CloudTrail org trail to S3 with Object Lock (Compliance, 7-year retention, MFA Delete).

See `docs/specs/OIDC-TRUST.md` and `docs/runbooks/SECRETS.md` for details.
