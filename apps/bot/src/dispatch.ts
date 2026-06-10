// Write commands map to a GitHub workflow_dispatch behind a confirm tap. The bot never
// execs on a server — it only asks GitHub Actions to run an already-reviewed workflow.
// Every plan is validated here; index/bot wires the confirm → claim → dispatch flow.

export interface DispatchPlan {
  /** Command name, used as the dispatch `kind`. */
  kind: string
  /** Workflow file to dispatch. */
  workflow: string
  /** Git ref to run against (always main — phone-triggered ops never run arbitrary refs). */
  ref: string
  inputs: Record<string, string>
  /** Human-readable one-liner for the confirm prompt + fired echo. */
  label: string
}

const ENVS = ["staging", "production"] as const
type DeployEnv = (typeof ENVS)[number]
function isEnv(s: string): s is DeployEnv {
  return (ENVS as readonly string[]).includes(s)
}

export interface ParseResult {
  plan?: DispatchPlan
  error?: string
}

/**
 * Parse a write command + its argument string into a validated dispatch plan.
 * `name` is the command (deploy|rollback|deploybot|dast); `args` is the raw text after it.
 */
export function parseCommand(name: string, args: string): ParseResult {
  const parts = args.trim().split(/\s+/).filter(Boolean)

  switch (name) {
    case "deploy": {
      const env = parts[0]
      if (!env || !isEnv(env)) {
        return { error: "Usage: /deploy <staging|production>" }
      }
      return {
        plan: {
          kind: "deploy",
          workflow: "_deploy-aws.yml",
          ref: "main",
          inputs: { environment: env, stack: "app-only" },
          label: `deploy ${env} (app-only)`,
        },
      }
    }
    case "rollback": {
      const env = parts[0]
      const tag = parts[1]
      if (!env || !isEnv(env) || !tag) {
        return { error: "Usage: /rollback <staging|production> <image-tag>" }
      }
      return {
        plan: {
          kind: "rollback",
          workflow: "_deploy-aws.yml",
          ref: "main",
          // Input name must match the workflow_dispatch declaration in
          // _deploy-aws.yml (`image_tag_override`) — GitHub 422s on
          // undeclared inputs and the dispatch never fires.
          inputs: { environment: env, image_tag_override: tag },
          label: `rollback ${env} → ${tag}`,
        },
      }
    }
    case "deploybot": {
      return {
        plan: {
          kind: "deploy-bot",
          workflow: "deploy-bot.yml",
          ref: "main",
          inputs: {},
          label: "redeploy the bot",
        },
      }
    }
    case "dast": {
      return {
        plan: {
          kind: "dast",
          workflow: "nuclei-dast.yml",
          ref: "main",
          inputs: {},
          label: "run nuclei DAST scan",
        },
      }
    }
    default:
      return { error: `Unknown write command: /${name}` }
  }
}

export const WRITE_COMMANDS = [
  "deploy",
  "rollback",
  "deploybot",
  "dast",
] as const

/** Short opaque token for the confirm callback (well under Telegram's 64-byte limit). */
export function randomToken(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
