# Supply Chain Incident Playbook

What to do when supply-chain trust breaks: Sigstore / Rekor outage, suspected
GitHub OIDC token compromise (the keyless equivalent of key compromise),
poisoned upstream action, or revocation of an already-published artifact.

> **Decision rule.** When in doubt, stop the line. Halt deploys, do not
> publish a new release that depends on the compromised infrastructure, and
> document everything in the incident channel before acting.

## Severities

- **SEV-1**: confirmed compromise of a signing identity, a poisoned dependency
  in `main`, or active exploitation. Rollback in progress.
- **SEV-2**: Sigstore / Rekor outage, no exploitation observed. Builds
  blocked but no live blast radius.
- **SEV-3**: a single bad attestation, scoped to one PR. Block the PR, rotate,
  resume.

## 1. Sigstore / Rekor outage

Symptom: `cosign sign-blob` or `cosign verify-blob` fails with a Rekor error,
Fulcio cannot mint a certificate, or `https://search.sigstore.dev` returns 5xx.

Steps:

1. Check status: <https://status.sigstore.dev>. If yellow/red, this is the
   shared service.
2. Halt all release workflows. Disable the `release.yml` workflow at the repo
   level via the Actions UI. CI builds without signing can keep running — they
   are advisory until signed.
3. Communicate: pin a notice in the engineering channel pointing at the
   Sigstore status page.
4. Wait. Do **not** disable Rekor uploads (`--tlog-upload=false`) just to
   ship — that loses the transparency log guarantee and the resulting
   artifact is unverifiable downstream.
5. When Sigstore returns green, run a smoke-test sign on a throwaway tarball
   to confirm Rekor entries land. Re-enable `release.yml`.
6. Backfill: any release that was paused must be re-tagged or re-built so the
   provenance entry exists in Rekor.

Time bound: if Sigstore is down for more than 24 hours, escalate to a
self-hosted Sigstore stack. Solo dev / public repo today: not in scope.

## 2. Suspected OIDC token compromise (keyless equivalent of key compromise)

Keyless signing has no long-lived private key — Fulcio mints a short-lived
certificate per workflow run, bound to the GitHub OIDC token. The
"key compromise" equivalent is a stolen / leaked OIDC token, or a workflow
that signs a bad artifact under a legitimate identity.

Detection:

- Unexpected Rekor entry for our repo identity. Search:
  ```bash
  cosign search-rekor \
    --search-rekor "https://rekor.sigstore.dev" \
    --type cosign \
    --identity-regexp "^https://github.com/${OWNER}/${REPO}/.*$"
  ```
- Out-of-band release tag that we did not push.
- An attestation pointing at a workflow run we did not approve.

Steps:

1. **Halt deploys immediately.** Disable any deploy automation; stop pulling
   the affected artifact in any environment.
2. **Identify the run.** Open the Rekor entry, follow the
   `subject` -> `runId` link. If the run was started by our automation,
   investigate the trigger. If not, the OIDC token issuer was tricked or the
   workflow file itself was modified.
3. **Inspect recent changes** to `.github/workflows/release.yml` and any
   reusable workflow it calls. Look for new third-party `uses:` references,
   non-SHA pins, modified secrets usage, or new `pull_request_target` triggers.
4. **Force-rotate.** Because keyless has no key, rotation means:
   - Remove the bad commit from `main` (revert PR), force a clean build.
   - Re-tag the release with a new version (do not reuse the compromised tag).
   - Publish a revocation attestation (next section) pointing at the
     compromised digest.
5. **Audit downstream.** Anyone who pulled the bad artifact must be notified.
   Today the only consumer is the developer; once AWS lands, ECS task
   definitions, deploy targets, and image-pull caches must be enumerated.

## 3. Revocation procedure

Rekor transparency log entries are immutable — there is no "revoke" button.
The path is:

1. **Publish a revocation attestation.** A signed in-toto statement asserting
   the compromised digest is unsafe. Convention: `predicateType` =
   `https://hapd.dev/revocation/v0.1` with fields `{ subject_digest, reason,
   ts, replacement_digest? }`.
   ```bash
   cat > revocation.json <<EOF
   {
     "_type": "https://in-toto.io/Statement/v1",
     "subject": [{ "name": "web-${TAG}.tar.gz", "digest": { "sha256": "${BAD_DIGEST}" } }],
     "predicateType": "https://hapd.dev/revocation/v0.1",
     "predicate": {
       "reason": "compromise: <short description>",
       "incident_id": "${INCIDENT_ID}",
       "replacement_digest": "${GOOD_DIGEST}",
       "ts": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
     }
   }
   EOF
   cosign attest-blob \
     --yes \
     --predicate revocation.json \
     --type "https://hapd.dev/revocation/v0.1" \
     --bundle "revocation-${BAD_DIGEST}.cosign.bundle" \
     "web-${TAG}.tar.gz"
   ```
2. **Update tags.** Move the floating tag (e.g. `latest`, `stable`) to point
   at the replacement digest. Delete the bad tag entirely if possible
   (`gh release delete "${TAG}"` and `git push origin :refs/tags/${TAG}`).
   Note: tag deletion is observable but not authoritative — the Rekor entry
   still exists.
3. **Pin verifiers to a minimum-trust digest.** The deploy verification
   runbook
   ([`SUPPLY-CHAIN-VERIFY-AT-DEPLOY.md`](./SUPPLY-CHAIN-VERIFY-AT-DEPLOY.md))
   should reject any subject whose digest matches the revocation list.
   Today: maintain `revocations.json` at the repo root with the bad digests.
   Future (post-AWS): the deploy step queries this file before
   `aws ecs update-service`.
4. **Document.** Add an entry to `docs/runbooks/SUPPLY-CHAIN-INCIDENT-LOG.md`
   (create on first incident) with the timeline, root cause, and revocation
   commit SHA.

## 4. Poisoned upstream action

If a third-party action used in our workflows is compromised (March 2025
`tj-actions/changed-files`, March 2026 `aquasecurity/trivy-action`):

1. **Identify exposure.** `git grep` the SHA across `.github/workflows/`. We
   pin by SHA, so a poisoned float tag does not affect us until Dependabot
   bumps. Check Dependabot PRs in the relevant window — close any that bump
   to a known-bad SHA.
2. **Pin to a clean SHA.** Identify the last known-good SHA from the upstream
   security advisory. Open a PR that pins to that SHA with a
   `# vX.Y.Z (last known-clean before <CVE-ID>)` comment.
3. **Re-run any release that ran on the bad SHA.** Re-tag, re-build,
   re-attest.
4. **Add a Dependabot ignore** for the bad version range until upstream
   confirms remediation.

## 5. Bad PR-time attestation (SEV-3)

Symptom: `dependency-review` or `osv-scanner-pr` fails with a finding the
author cannot fix locally. The artifact may have already been built but not
released.

Steps:

1. Block the PR (already automatic — required status check).
2. Reproduce locally with the same inputs.
3. If the finding is a true positive, fix and push. If a false positive, add
   to the per-tool ignore list with a justification comment.
4. No public action needed — nothing was released.

## After-incident

- Write a post-mortem within 5 working days. Template:
  - Timeline (UTC).
  - Detection vector (alert, manual, downstream report).
  - Root cause.
  - Blast radius.
  - Permanent fix.
  - Process improvements (what would have caught this earlier).
- Update this runbook if a step was missing or wrong.
- File a tracking issue for any deferred work surfaced during response.
