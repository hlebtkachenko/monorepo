# Supply Chain Security Specification

Design summary. The actual workflows live under `.github/workflows/_supply-chain-*.yml` and are owned by the supply-chain plan executor. This document captures the design and threat model.

## Controls

| Control | Standard | Tooling | Output |
|---------|----------|---------|--------|
| SBOM | CycloneDX 1.6 | syft | per-build `sbom.cdx.json`, attached as workflow artifact + GitHub Release asset |
| Provenance (build) | SLSA L2 | `actions/attest-build-provenance` | `.intoto.jsonl` attestation, attached to release; uploaded to Rekor |
| Provenance (release) | SLSA L3 | `slsa-framework/slsa-github-generator` | full L3 isolated builder, only on tagged releases |
| Signing | Sigstore cosign | `sigstore/cosign-installer` | OCI signature, keyless, recorded in Rekor public log |
| Verification (deploy time) | cosign + slsa-verifier | `cosign verify-attestation` | gate that runs in `_deploy-aws.yml` |
| Vulnerability scan (lib) | OSV | osv-scanner | PR check, fail on Critical |
| License compliance | SPDX | scripts/license-check.mjs (Writer B owns) | PR check, deny-list enforced |

## Where each artifact lives

- **SBOM**: artifact + Release asset; later (post-bootstrap) also attached as ECR OCI referrer using `oras attach`.
- **SLSA L2 provenance**: every successful build of `apps/web/Dockerfile`. Attached to artifacts and to the OCI image as a referrer.
- **SLSA L3 provenance**: only when a tag matching `v*.*.*` is pushed. Built by the SLSA isolated builder, not the regular `_build-image.yml`.
- **Cosign signature**: every pushed image, keyless, identity bound to the workflow + repo + ref. Recorded in Rekor.

## Verify-at-deploy (future)

`_deploy-aws.yml` will, before any ECS update:

```bash
cosign verify "$IMAGE@$DIGEST" \
  --certificate-identity-regexp '^https://github.com/hlebtkachenko/monorepo/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

cosign verify-attestation --type slsaprovenance "$IMAGE@$DIGEST" \
  --certificate-identity-regexp '^https://github.com/hlebtkachenko/monorepo/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

A failure here aborts the deploy, period. No bypass flag.

The runbook stub already exists (`docs/runbooks/DEPLOY.md`); the workflow gate lands with the supply-chain executor.

## Threat model snippet

| Threat | Control |
|--------|---------|
| Compromised dependency injects malicious code | SBOM + osv-scanner catches known CVEs; license check blocks unknown sources; provenance proves what built the image |
| Compromised CI runner builds a backdoored image | SLSA L3 isolated builder for releases; cosign signs only on the runner that built (identity binding) |
| Supply chain typosquatting | Lockfile-frozen install, license deny-list, manual review on first-time dep |
| Image swapped between sign and deploy | cosign verify at deploy time; digest pinned in deployment record |
| Signature replay across repos | OIDC issuer + cert identity check binds signature to this repo+workflow only |
| Long-lived credential leak | No long-lived creds. OIDC short-lived tokens only. |
| Tag re-pushed to point to a different commit | Releases are immutable in policy; tag re-push blocked by branch protection on tags + by cosign signature mismatch on subsequent verify |

## Cross-references

- `.github/workflows/_build-image.yml` (writes the artifacts in scope here)
- `docs/runbooks/DEPLOY.md` (consumer of cosign verify)
- `docs/runbooks/ROLLBACK.md` (forbids unsigned rollback images)
- `docs/specs/OIDC-TRUST.md` (the OIDC token is the foundation for both deploy and signing)
