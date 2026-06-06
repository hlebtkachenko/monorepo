// Minimal GitHub REST client for the control plane. Drives workflow_dispatch (write
// commands), rerun-failed-jobs (CI Rerun button), and read queries (runs / PRs / job
// logs). Every call is best-effort: it returns null/false on failure rather than
// throwing into a Telegram handler. Token + repo come from env.

const API = "https://api.github.com"

export interface WorkflowRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  htmlUrl: string
  branch: string
  event: string
  createdAt: string
}

export interface PullRequest {
  number: number
  title: string
  htmlUrl: string
  draft: boolean
  user: string
}

export interface RunJob {
  name: string
  conclusion: string | null
  htmlUrl: string
  failedSteps: string[]
}

export interface GitHubClient {
  /** POST a workflow_dispatch. `workflow` is the file name (e.g. `_deploy-aws.yml`). 204 = ok. */
  dispatch(
    workflow: string,
    ref: string,
    inputs: Record<string, string>,
  ): Promise<boolean>
  /** Re-run only the failed jobs of a run. 201 = ok. */
  rerunFailedJobs(runId: number): Promise<boolean>
  listRuns(perPage?: number): Promise<WorkflowRun[]>
  listPulls(): Promise<PullRequest[]>
  /** Jobs of a run, each with its failed step names — for a /logs summary. */
  runJobs(runId: number): Promise<RunJob[]>
}

interface RunRow {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
  head_branch: string
  event: string
  created_at: string
}
interface PullRow {
  number: number
  title: string
  html_url: string
  draft: boolean
  user: { login: string } | null
}
interface JobRow {
  name: string
  conclusion: string | null
  html_url: string
  steps?: { name: string; conclusion: string | null }[]
}

export function createGitHubClient(
  token: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): GitHubClient {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "afframe-bot",
  }

  async function get<T>(path: string): Promise<T | null> {
    try {
      const res = await fetchImpl(`${API}/repos/${repo}${path}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return null
      return (await res.json()) as T
    } catch {
      return null
    }
  }

  return {
    async dispatch(workflow, ref, inputs) {
      try {
        const res = await fetchImpl(
          `${API}/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
          {
            method: "POST",
            headers: { ...headers, "content-type": "application/json" },
            body: JSON.stringify({ ref, inputs }),
            signal: AbortSignal.timeout(8000),
          },
        )
        return res.status === 204
      } catch {
        return false
      }
    },
    async rerunFailedJobs(runId) {
      try {
        const res = await fetchImpl(
          `${API}/repos/${repo}/actions/runs/${runId}/rerun-failed-jobs`,
          { method: "POST", headers, signal: AbortSignal.timeout(8000) },
        )
        return res.status === 201
      } catch {
        return false
      }
    },
    async listRuns(perPage = 8) {
      const json = await get<{ workflow_runs?: RunRow[] }>(
        `/actions/runs?per_page=${perPage}`,
      )
      return (json?.workflow_runs ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        htmlUrl: r.html_url,
        branch: r.head_branch,
        event: r.event,
        createdAt: r.created_at,
      }))
    },
    async listPulls() {
      const json = await get<PullRow[]>(`/pulls?state=open&per_page=10`)
      return (json ?? []).map((p) => ({
        number: p.number,
        title: p.title,
        htmlUrl: p.html_url,
        draft: p.draft,
        user: p.user?.login ?? "?",
      }))
    },
    async runJobs(runId) {
      const json = await get<{ jobs?: JobRow[] }>(
        `/actions/runs/${runId}/jobs?per_page=30`,
      )
      return (json?.jobs ?? []).map((j) => ({
        name: j.name,
        conclusion: j.conclusion,
        htmlUrl: j.html_url,
        failedSteps: (j.steps ?? [])
          .filter((s) => s.conclusion === "failure")
          .map((s) => s.name),
      }))
    },
  }
}

export function repoOf(env: { GITHUB_REPO?: string }): string {
  return env.GITHUB_REPO ?? "hlebtkachenko/monorepo"
}
