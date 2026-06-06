import { describe, it, expect, vi } from "vitest"
import { createGitHubClient, repoOf } from "./github.js"

function res(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status })
}

describe("createGitHubClient", () => {
  it("dispatch posts ref + inputs and treats 204 as success", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    )
    const gh = createGitHubClient(
      "tok",
      "o/r",
      fetchImpl as unknown as typeof fetch,
    )
    const ok = await gh.dispatch("_deploy-aws.yml", "main", {
      environment: "staging",
    })
    expect(ok).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toContain(
      "/repos/o/r/actions/workflows/_deploy-aws.yml/dispatches",
    )
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      ref: "main",
      inputs: { environment: "staging" },
    })
  })

  it("dispatch returns false on a non-204", async () => {
    const gh = createGitHubClient("tok", "o/r", (async () =>
      res(422, { message: "bad" })) as unknown as typeof fetch)
    expect(await gh.dispatch("x.yml", "main", {})).toBe(false)
  })

  it("rerunFailedJobs treats 201 as success", async () => {
    const gh = createGitHubClient(
      "tok",
      "o/r",
      (async () =>
        new Response(null, { status: 201 })) as unknown as typeof fetch,
    )
    expect(await gh.rerunFailedJobs(7)).toBe(true)
  })

  it("listRuns maps the payload; an error yields []", async () => {
    const gh = createGitHubClient("tok", "o/r", (async () =>
      res(200, {
        workflow_runs: [
          {
            id: 1,
            name: "CI",
            status: "completed",
            conclusion: "failure",
            html_url: "u",
            head_branch: "main",
            event: "push",
            created_at: "t",
          },
        ],
      })) as unknown as typeof fetch)
    const runs = await gh.listRuns()
    expect(runs[0]).toMatchObject({ id: 1, name: "CI", conclusion: "failure" })

    const broken = createGitHubClient("tok", "o/r", (async () => {
      throw new Error("network")
    }) as unknown as typeof fetch)
    expect(await broken.listRuns()).toEqual([])
  })

  it("runJobs extracts failed steps", async () => {
    const gh = createGitHubClient("tok", "o/r", (async () =>
      res(200, {
        jobs: [
          {
            name: "build",
            conclusion: "failure",
            html_url: "u",
            steps: [
              { name: "compile", conclusion: "failure" },
              { name: "setup", conclusion: "success" },
            ],
          },
        ],
      })) as unknown as typeof fetch)
    const jobs = await gh.runJobs(5)
    expect(jobs[0]?.failedSteps).toEqual(["compile"])
  })
})

describe("repoOf", () => {
  it("defaults to the monorepo slug", () => {
    expect(repoOf({})).toBe("hlebtkachenko/monorepo")
    expect(repoOf({ GITHUB_REPO: "x/y" })).toBe("x/y")
  })
})
