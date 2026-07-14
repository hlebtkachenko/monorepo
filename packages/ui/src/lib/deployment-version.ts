export interface DeploymentIdentity {
  sha: string
  version: string
}

export interface DeploymentVersionPayload extends DeploymentIdentity {
  time: string
  runtime: string
}

export function deploymentKey(deployment: DeploymentIdentity): string | null {
  const sha = deployment.sha.trim()
  const version = deployment.version.trim()
  const parts: string[] = []

  if (sha && sha !== "unknown") parts.push(sha)
  if (version && version !== "unknown" && version !== "dev") {
    parts.push(version)
  }

  return parts.length > 0 ? parts.join(":") : null
}

export function isDeploymentVersionPayload(
  value: unknown,
): value is DeploymentVersionPayload {
  if (!value || typeof value !== "object") return false

  const payload = value as Record<string, unknown>
  if (
    typeof payload.sha !== "string" ||
    typeof payload.version !== "string" ||
    typeof payload.time !== "string" ||
    typeof payload.runtime !== "string"
  ) {
    return false
  }

  return true
}
