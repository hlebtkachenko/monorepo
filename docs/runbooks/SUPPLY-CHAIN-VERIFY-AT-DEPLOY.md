# Supply Chain Verification at Deploy

How to verify a release artifact produced by `.github/workflows/release.yml`
before promoting it. The verification surface today is a tarball plus its
SBOM, SLSA L3 provenance, and cosign signature bundles attached to the GitHub
Release. AWS / ECR is live; wiring the OCI-image + referrer-attestation checks
into the deploy pipeline is still pending.

> **Decision rule.** Three checks must pass: cosign signature on the artifact,
> SBOM signature, and SLSA provenance. Any failure aborts the deploy. There is
> no manual override — re-run the build and produce a new attestation.

## Inputs

- `OWNER`: GitHub org or user that owns the source repo (e.g. `hlebtkachenko`).
- `REPO`: Repository name (e.g. `monorepo`).
- `TAG`: Release tag (e.g. `v1.4.0`).
- `WORK_DIR`: Scratch directory for downloads.

```bash
export OWNER="hlebtkachenko"
export REPO="monorepo"
export TAG="v1.4.0"
export WORK_DIR="$(mktemp -d -t verify-${TAG}-XXXXXX)"
cd "$WORK_DIR"
```

## Prerequisites

- `gh` CLI authenticated against the repo.
- `cosign` 3.0.6 or newer. Install:
  ```bash
  brew install cosign
  cosign version
  ```
- `jq` for inspecting JSON attestations.

## 1. Download release assets

```bash
gh release download "$TAG" \
  --repo "${OWNER}/${REPO}" \
  --dir "$WORK_DIR"
ls -la "$WORK_DIR"
```

You should see:

- `web-${TAG}.tar.gz` — the build artifact.
- `web-${TAG}.cosign.bundle` — cosign signature bundle for the tarball.
- `sbom.cdx.json` — CycloneDX 1.6 SBOM.
- `sbom.cdx.json.cosign.bundle` — cosign signature bundle for the SBOM.
- `web-${TAG}.intoto.jsonl` — SLSA L3 provenance attestation.

## 2. Verify cosign signature on the tarball

```bash
cosign verify-blob \
  --bundle "web-${TAG}.tar.gz.cosign.bundle" \
  --certificate-identity-regexp "^https://github.com/${OWNER}/${REPO}/\.github/workflows/.*\.yml@refs/tags/${TAG}$" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "web-${TAG}.tar.gz"
```

Expected output: `Verified OK`.

If this fails:

- Confirm the tag matches the workflow that produced the artifact.
- Inspect the bundle: `cosign verify-blob --insecure-ignore-tlog ...` (only
  for diagnosis — never accept an artifact that fails Rekor lookup).
- Check the Rekor entry directly:
  ```bash
  cosign verify-blob \
    --bundle "web-${TAG}.tar.gz.cosign.bundle" \
    --certificate-identity-regexp ... \
    --certificate-oidc-issuer ... \
    --rekor-url "https://rekor.sigstore.dev" \
    "web-${TAG}.tar.gz"
  ```

## 3. Verify cosign signature on the SBOM

```bash
cosign verify-blob \
  --bundle "sbom.cdx.json.cosign.bundle" \
  --certificate-identity-regexp "^https://github.com/${OWNER}/${REPO}/\.github/workflows/.*\.yml@refs/tags/${TAG}$" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "sbom.cdx.json"
```

A signed SBOM proves the dependency list was produced by the same workflow
that built the tarball, not edited after the fact.

## 4. Verify SLSA L3 provenance

The provenance is an in-toto attestation in the DSSE envelope format
(`.intoto.jsonl`). Use the SLSA verifier (`slsa-verifier`) for the strongest
guarantee:

```bash
brew install slsa-verifier
slsa-verifier verify-artifact \
  --provenance-path "web-${TAG}.intoto.jsonl" \
  --source-uri "github.com/${OWNER}/${REPO}" \
  --source-tag "${TAG}" \
  "web-${TAG}.tar.gz"
```

Expected output: `PASSED: SLSA verification passed`.

What this proves:

- The artifact digest in the provenance matches the tarball you have.
- The provenance was produced inside the SLSA generator reusable workflow
  (the L3 isolation requirement).
- The source repo and tag in the provenance match what you asked for.

## 5. Cross-check the SBOM digest

The build provenance includes the artifact digest. Cross-check the SBOM is
about the same artifact:

```bash
ARTIFACT_DIGEST=$(sha256sum "web-${TAG}.tar.gz" | awk '{print $1}')
echo "Artifact sha256: ${ARTIFACT_DIGEST}"

# The SBOM `metadata.component.hashes` should reference the same digest, or
# the SBOM should describe the file system that produced the tarball.
jq '.metadata.component' "sbom.cdx.json"
```

There is no automated equality check today — the SBOM is signed by the same
workflow run, which is the integrity claim. Inspect manually if forensics
demand it.

## 6. Decide

If all four checks pass (cosign on tarball, cosign on SBOM, SLSA verifier on
provenance, SBOM digest sanity check), the artifact is safe to deploy.

If any check fails, the deploy MUST abort. Open an incident per
[`SUPPLY-CHAIN-INCIDENT.md`](./SUPPLY-CHAIN-INCIDENT.md).

## OCI image verification (ECR live; deploy-time gate pending)

Replace the tarball flow with OCI referrer attestations. The image digest
becomes the canonical reference; SBOM, provenance, and signature are pushed
as referring artifacts next to the image in ECR.

```bash
# Pseudocode — uncomment and parameterise once ECR is provisioned.
# IMAGE_DIGEST=$(aws ecr describe-images \
#   --repository-name web --image-ids imageTag="${TAG}" \
#   --query 'imageDetails[0].imageDigest' --output text)
# IMAGE_URI="${ECR_REGISTRY}/web@${IMAGE_DIGEST}"
#
# # 1. Image signature
# cosign verify "${IMAGE_URI}" \
#   --certificate-identity-regexp "^https://github.com/${OWNER}/${REPO}/\.github/workflows/release\.yml@refs/tags/.*$" \
#   --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
#
# # 2. SLSA provenance attestation
# cosign verify-attestation --type slsaprovenance "${IMAGE_URI}" \
#   --certificate-identity-regexp "^https://github.com/slsa-framework/slsa-github-generator/.*$" \
#   --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
#
# # 3. SBOM attestation
# cosign verify-attestation --type cyclonedx "${IMAGE_URI}" \
#   --certificate-identity-regexp "^https://github.com/${OWNER}/${REPO}/.*$" \
#   --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
#
# # Only after all three exit 0, run aws ecs update-service.
```

The wiring point is a pre-deploy step in the deploy workflow, or the
entrypoint of an AWS CodeBuild project sitting between ECR push and ECS
update. Production is live (v0.2.5), but the deploy pipeline does not yet run cosign verify-attestation as a gate.

## Cleanup

```bash
rm -rf "$WORK_DIR"
```
