import { describe, it, expect } from "vitest"
import { processEvent, type EngineDeps } from "./engine.js"
import type { Store } from "../state/store.js"
import type { LinearClient, CreatedIssue, CreateIssueInput } from "./linear.js"
import { fingerprint } from "./fingerprint.js"
import { labelsFor, LABEL } from "./labels.js"
import type { IssueEvent } from "./types.js"
import { fakeStore } from "../state/fake-store.js"

interface SpyLinear extends LinearClient {
  creates: CreateIssueInput[]
  comments: { issueId: string; body: string }[]
}

function fakeLinear(
  createImpl?: () => Promise<CreatedIssue | null>,
): SpyLinear {
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
            id: "iss_1",
            identifier: "DEV-100",
            url: "https://linear.app/hapddev/issue/DEV-100",
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

const deps = (store: Store, linear: LinearClient): EngineDeps => ({
  store,
  linear,
  teamId: "team",
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

describe("labelsFor", () => {
  it("ci-failure → agent-created + ci-failure + fix", () => {
    const l = labelsFor({
      ...baseEvent,
      source: "ci-failure",
      risk: undefined,
      area: undefined,
    })
    expect(l).toContain(LABEL.agentCreated)
    expect(l).toContain(LABEL.ciFailure)
    expect(l).toContain(LABEL.typeFix)
  })
  it("security-scan → security-scan + security type", () => {
    const l = labelsFor({ ...baseEvent, source: "security-scan" })
    expect(l).toContain(LABEL.securityScan)
    expect(l).toContain(LABEL.typeSecurity)
  })
  it("includes risk + area when set", () => {
    const l = labelsFor(baseEvent)
    expect(l).toContain(LABEL.risk.high)
    expect(l).toContain(LABEL.area.api)
  })
})

describe("processEvent", () => {
  it("creates a new issue + dedup row on first sight", async () => {
    const store = fakeStore()
    const linear = fakeLinear()
    const r = await processEvent(baseEvent, deps(store, linear))
    expect(r?.action).toBe("created")
    expect(linear.creates).toHaveLength(1)
    expect(linear.comments).toHaveLength(0)
    expect(linear.creates[0]?.title).toBe("[ALERT] boom")
    expect(await store.getDedup(r!.fingerprint)).not.toBeNull()
  })

  it("comments + bumps on repeat, no second issue", async () => {
    const store = fakeStore()
    const linear = fakeLinear()
    const first = await processEvent(baseEvent, deps(store, linear))
    const second = await processEvent(baseEvent, deps(store, linear))
    expect(second?.action).toBe("commented")
    expect(second?.count).toBe(2)
    expect(linear.creates).toHaveLength(1)
    expect(linear.comments).toHaveLength(1)
    expect(second?.fingerprint).toBe(first?.fingerprint)
  })

  it("returns null + writes no dedup row when Linear create fails", async () => {
    const store = fakeStore()
    const linear = fakeLinear(async () => null)
    const r = await processEvent(baseEvent, deps(store, linear))
    expect(r).toBeNull()
    expect(
      await store.getDedup(
        await fingerprint(baseEvent.source, baseEvent.fingerprintParts),
      ),
    ).toBeNull()
  })
})
