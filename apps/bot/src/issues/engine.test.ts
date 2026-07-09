import { describe, it, expect } from "vitest"
import { processEvent, type EngineDeps } from "./engine.js"
import type { Store } from "../state/store.js"
import type {
  GitHubIssueClient,
  CreatedIssue,
  CreateIssueInput,
} from "./github.js"
import { fingerprint } from "./fingerprint.js"
import {
  labelsFor,
  parseProjectFieldConfig,
  projectFieldsFor,
  type ProjectFieldConfig,
} from "./labels.js"
import type { IssueEvent } from "./types.js"
import { fakeStore } from "../state/fake-store.js"

const repo = "owner/repository"
const projectFieldConfig: ProjectFieldConfig = {
  status: { fieldId: "status-field", backlogOptionId: "status-backlog" },
  type: {
    fieldId: "type-field",
    options: {
      feat: "type-feat",
      fix: "type-fix",
      docs: "type-docs",
      security: "type-security",
    },
  },
  priority: {
    fieldId: "priority-field",
    options: {
      urgent: "priority-urgent",
      high: "priority-high",
      medium: "priority-medium",
      low: "priority-low",
    },
  },
}

interface SpyIssues extends GitHubIssueClient {
  creates: CreateIssueInput[]
  comments: { issueId: string; body: string }[]
}

function fakeIssues(
  createImpl?: () => Promise<CreatedIssue | null>,
): SpyIssues {
  const creates: CreateIssueInput[] = []
  const comments: { issueId: string; body: string }[] = []
  return {
    creates,
    comments,
    async createIssue(input) {
      creates.push(input)
      return createImpl
        ? createImpl()
        : {
            number: 100,
            restId: 1000,
            url: `https://github.com/${repo}/issues/100`,
          }
    },
    async addComment(issueId, body) {
      comments.push({ issueId, body })
      return true
    },
  }
}

const baseEvent: IssueEvent = {
  source: "error",
  title: "boom",
  body: "stack",
  fingerprintParts: ["api", "TypeError x"],
  area: "api",
  risk: "high",
}

const deps = (store: Store, issues: GitHubIssueClient): EngineDeps => ({
  store,
  issues,
  repo,
  projectId: "project",
  projectFieldConfig,
  parentIssueNumber: 607,
  now: () => 1000,
})

describe("fingerprint", () => {
  it("stable for identical parts", async () => {
    expect(await fingerprint("error", ["a", "b"])).toBe(
      await fingerprint("error", ["a", "b"]),
    )
  })
  it("differs by source", async () => {
    expect(await fingerprint("error", ["a"])).not.toBe(
      await fingerprint("ci-failure", ["a"]),
    )
  })
  it("normalizes case + whitespace", async () => {
    expect(await fingerprint("e", ["Foo  Bar"])).toBe(
      await fingerprint("e", ["foo bar"]),
    )
  })
})

describe("issue mapping", () => {
  it("ci-failure maps to bug label + fix type", () => {
    const l = labelsFor({
      ...baseEvent,
      source: "ci-failure",
      risk: undefined,
      area: undefined,
    })
    expect(l).toEqual(["bug"])
    expect(
      projectFieldsFor(
        { ...baseEvent, source: "ci-failure" },
        projectFieldConfig,
      ),
    ).toContainEqual({
      fieldId: "type-field",
      optionId: "type-fix",
    })
  })
  it("customer requests map to enhancement label + feat type", () => {
    const event = { ...baseEvent, source: "customer-request" as const }
    expect(labelsFor(event)).toEqual(["enhancement"])
    expect(projectFieldsFor(event, projectFieldConfig)).toContainEqual({
      fieldId: "type-field",
      optionId: "type-feat",
    })
  })
  it("explicit docs type overrides source default", () => {
    expect(
      projectFieldsFor(
        {
          ...baseEvent,
          source: "customer-request",
          type: "docs",
        },
        projectFieldConfig,
      ),
    ).toContainEqual({
      fieldId: "type-field",
      optionId: "type-docs",
    })
  })
  it("security-scan maps to security project type", () => {
    const l = labelsFor({ ...baseEvent, source: "security-scan" })
    expect(l).toEqual(["bug"])
    expect(
      projectFieldsFor(
        { ...baseEvent, source: "security-scan" },
        projectFieldConfig,
      ),
    ).toContainEqual({
      fieldId: "type-field",
      optionId: "type-security",
    })
  })
  it("maps blocking risk to urgent priority", () => {
    expect(
      projectFieldsFor({ ...baseEvent, risk: "blocking" }, projectFieldConfig),
    ).toContainEqual({
      fieldId: "priority-field",
      optionId: "priority-urgent",
    })
  })
  it("omits project fields when no Project config is supplied", () => {
    expect(projectFieldsFor(baseEvent)).toEqual([])
  })
  it("parseProjectFieldConfig drops malformed sections instead of throwing", () => {
    // A partial config (type present but no `options`) previously TypeError'd deep in
    // projectFieldsFor, escaping the emit fail-soft seam and 500-ing the /issue path.
    const config = parseProjectFieldConfig('{"type":{"fieldId":"F"}}')
    expect(config).toEqual({})
    expect(() => projectFieldsFor(baseEvent, config)).not.toThrow()
    expect(projectFieldsFor(baseEvent, config)).toEqual([])
  })
  it("parseProjectFieldConfig keeps well-formed sections", () => {
    const config = parseProjectFieldConfig(JSON.stringify(projectFieldConfig))
    expect(config?.type?.fieldId).toBe("type-field")
    expect(config?.status?.backlogOptionId).toBe("status-backlog")
  })
  it("parseProjectFieldConfig returns undefined only when unset or unparseable", () => {
    expect(parseProjectFieldConfig(undefined)).toBeUndefined()
    expect(parseProjectFieldConfig("not json")).toBeUndefined()
  })
})

describe("processEvent", () => {
  it("creates a new issue + dedup row on first sight", async () => {
    const store = fakeStore()
    const issues = fakeIssues()
    const r = await processEvent(baseEvent, deps(store, issues))
    expect(r?.action).toBe("created")
    expect(issues.creates).toHaveLength(1)
    expect(issues.comments).toHaveLength(0)
    expect(issues.creates[0]?.title).toBe("[ALERT] boom")
    expect(issues.creates[0]?.projectId).toBe("project")
    expect(issues.creates[0]?.parentIssueNumber).toBe(607)
    expect(await store.getDedup(r!.fingerprint)).not.toBeNull()
  })

  it("comments + bumps on repeat, no second issue", async () => {
    const store = fakeStore()
    const issues = fakeIssues()
    const first = await processEvent(baseEvent, deps(store, issues))
    const second = await processEvent(baseEvent, deps(store, issues))
    expect(second?.action).toBe("commented")
    expect(second?.count).toBe(2)
    expect(issues.creates).toHaveLength(1)
    expect(issues.comments).toHaveLength(1)
    expect(second?.fingerprint).toBe(first?.fingerprint)
  })

  it("returns null + writes no dedup row when GitHub issue create fails", async () => {
    const store = fakeStore()
    const issues = fakeIssues(async () => null)
    const r = await processEvent(baseEvent, deps(store, issues))
    expect(r).toBeNull()
    expect(
      await store.getDedup(
        await fingerprint(baseEvent.source, baseEvent.fingerprintParts),
      ),
    ).toBeNull()
  })

  it("re-files a fresh GitHub issue when the dedup row holds a stale Linear id", async () => {
    const store = fakeStore()
    const fp = await fingerprint(baseEvent.source, baseEvent.fingerprintParts)
    await store.createDedup({
      fingerprint: fp,
      issueId: "9f1c-linear-uuid",
      identifier: "DEV-42",
      count: 3,
      firstSeen: 1,
      lastSeen: 1,
    })
    const issues = fakeIssues()
    const r = await processEvent(baseEvent, deps(store, issues))
    expect(r?.action).toBe("created")
    expect(issues.comments).toHaveLength(0)
    expect(issues.creates).toHaveLength(1)
    const row = await store.getDedup(fp)
    expect(row?.issueId).toBe("100")
    expect(row?.identifier).toBe("#100")
    expect(row?.count).toBe(1)
  })

  it("re-files when commenting on the existing issue fails", async () => {
    const store = fakeStore()
    const fp = await fingerprint(baseEvent.source, baseEvent.fingerprintParts)
    await store.createDedup({
      fingerprint: fp,
      issueId: "55",
      identifier: "#55",
      count: 2,
      firstSeen: 1,
      lastSeen: 1,
    })
    const issues = fakeIssues()
    issues.addComment = async (issueId, body) => {
      issues.comments.push({ issueId, body })
      return false
    }
    const r = await processEvent(baseEvent, deps(store, issues))
    expect(r?.action).toBe("created")
    expect(issues.comments).toHaveLength(1)
    expect(issues.creates).toHaveLength(1)
    expect((await store.getDedup(fp))?.issueId).toBe("100")
  })
})
