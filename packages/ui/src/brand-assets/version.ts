import type { DeploymentIdentity } from "../lib/deployment-version"

/**
 * Build version read from BUILD_VERSION env at SSR / process-start time.
 *
 * Source: `docker/metadata-action` emits this via the Docker image build
 * (`.github/workflows/_build-image.yml` passes it through as
 * `BUILD_VERSION`). On a tagged commit it is the semver string (`0.2.0`);
 * on a branch build it's `sha-<short>` or `branch-<name>`. Local dev
 * leaves it unset and the helper returns `"dev"` so the footer surface
 * is never blank.
 *
 * Plain semver (matches `^\d+\.\d+\.\d+`) is prefixed with `v` to align
 * with the release tag convention; non-semver values display as-is.
 *
 * Server-only — `process.env.BUILD_VERSION` is not in the client bundle
 * unless prefixed `NEXT_PUBLIC_*`. If you need the version in a client
 * component, fetch it from `/api/version` (apps/web/app/api/version/route.ts).
 *
 * See `docs/conventions/RELEASES.md` for the full release flow.
 */
export function getBuildVersion(): string {
  const raw = getBuildIdentity().version
  return /^\d+\.\d+\.\d+/.test(raw) ? `v${raw}` : raw
}

export function getBuildIdentity(): DeploymentIdentity {
  return {
    sha: process.env.BUILD_SHA ?? "unknown",
    version: process.env.BUILD_VERSION ?? "dev",
  }
}
