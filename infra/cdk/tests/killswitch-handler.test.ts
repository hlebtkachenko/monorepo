import { beforeEach, describe, expect, it, vi } from "vitest"

const { send } = vi.hoisted(() => {
  process.env.CLUSTER_NAME = "monorepo-test"
  process.env.SERVICE_NAME = "monorepo-test-svc"
  return { send: vi.fn() }
})

vi.mock("@aws-sdk/client-ecs", () => {
  class ECSClient {
    send = send
  }
  return {
    ECSClient,
    DescribeServicesCommand: vi.fn((input) => ({ __type: "Describe", input })),
    UpdateServiceCommand: vi.fn((input) => ({ __type: "Update", input })),
  }
})

// @ts-expect-error - .mjs handler ships without declaration types
import { handler } from "../lib/lambda/killswitch/index.mjs"

type HandlerResult = { results: Array<Record<string, unknown>> }

function snsRecord(message: string): {
  Sns: { Message: string; MessageId: string }
} {
  return { Sns: { Message: message, MessageId: "msg-" + Math.random() } }
}

describe("killswitch handler", () => {
  beforeEach(() => {
    send.mockReset()
    send.mockImplementation(async (cmd: { __type: string }) => {
      if (cmd.__type === "Describe") {
        return { services: [{ desiredCount: 1 }] }
      }
      return {}
    })
  })

  it("stops ECS on a CloudWatch alarm JSON with NewStateValue=ALARM", async () => {
    const message = JSON.stringify({
      AlarmName: "monorepo-test-fargate-network-out-high",
      NewStateValue: "ALARM",
    })
    const result = (await handler({
      Records: [snsRecord(message)],
    })) as HandlerResult

    expect(result.results[0]?.action).toBe("stop-ecs")
    const updateCalls = send.mock.calls.filter(
      ([c]) => (c as { __type: string }).__type === "Update",
    )
    expect(updateCalls.length).toBe(1)
  })

  it("skips alarm in OK / INSUFFICIENT_DATA state", async () => {
    const message = JSON.stringify({
      AlarmName: "monorepo-test-fargate-network-out-high",
      NewStateValue: "OK",
    })
    const result = (await handler({
      Records: [snsRecord(message)],
    })) as HandlerResult

    expect(result.results[0]?.action).toBe("skip")
    expect(result.results[0]?.reason).toBe("not-in-alarm-state")
    const updateCalls = send.mock.calls.filter(
      ([c]) => (c as { __type: string }).__type === "Update",
    )
    expect(updateCalls.length).toBe(0)
  })

  it("skips alarm whose name is unknown", async () => {
    const message = JSON.stringify({
      AlarmName: "some-random-alarm-name",
      NewStateValue: "ALARM",
    })
    const result = (await handler({
      Records: [snsRecord(message)],
    })) as HandlerResult

    expect(result.results[0]?.action).toBe("skip")
    expect(result.results[0]?.reason).toBe("unknown-alarm")
  })

  it("stops ECS on a plain-text AWS Budgets notification (non-JSON)", async () => {
    const result = (await handler({
      Records: [
        snsRecord(
          "AWS Budgets Notification: actual spend exceeded 100% of monorepo-test-monthlytotal.",
        ),
      ],
    })) as HandlerResult

    expect(result.results[0]?.source).toBe("budget")
    expect(result.results[0]?.action).toBe("stop-ecs")
    const updateCalls = send.mock.calls.filter(
      ([c]) => (c as { __type: string }).__type === "Update",
    )
    expect(updateCalls.length).toBe(1)
  })

  it("no-ops on alarm fire when desiredCount is already 0 (idempotent)", async () => {
    send.mockImplementation(async (cmd: { __type: string }) => {
      if (cmd.__type === "Describe") {
        return { services: [{ desiredCount: 0 }] }
      }
      return {}
    })

    const message = JSON.stringify({
      AlarmName: "monorepo-test-fargate-cpu-critical",
      NewStateValue: "ALARM",
    })
    const result = (await handler({
      Records: [snsRecord(message)],
    })) as HandlerResult

    expect(result.results[0]?.action).toBe("noop")
    expect(result.results[0]?.reason).toBe("already-stopped")
    const updateCalls = send.mock.calls.filter(
      ([c]) => (c as { __type: string }).__type === "Update",
    )
    expect(updateCalls.length).toBe(0)
  })
})
