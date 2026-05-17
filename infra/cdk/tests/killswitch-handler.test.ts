import { beforeEach, describe, expect, it, vi } from "vitest"

const TEST_TOPIC_ARN = "arn:aws:sns:eu-west-1:123456789012:KillSwitchTopic"

const { send } = vi.hoisted(() => {
  process.env.CLUSTER_NAME = "monorepo-test"
  process.env.SERVICE_NAME = "monorepo-test-svc"
  process.env.EXPECTED_TOPIC_ARN =
    "arn:aws:sns:eu-west-1:123456789012:KillSwitchTopic"
  process.env.KILL_SWITCH_ALARM_NAMES = [
    "monorepo-test-fargate-network-out-high",
    "monorepo-test-fargate-cpu-critical",
    "monorepo-test-cwlogs-ingest-high",
    "monorepo-test-s3-put-rate-high",
  ].join(",")
  return { send: vi.fn() }
})

vi.mock("@aws-sdk/client-ecs", () => {
  class ECSClient {
    send = send
  }
  class DescribeServicesCommand {
    __type = "Describe"
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  }
  class UpdateServiceCommand {
    __type = "Update"
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  }
  return { ECSClient, DescribeServicesCommand, UpdateServiceCommand }
})

// @ts-expect-error - .mjs handler ships without declaration types
import { handler } from "../lib/lambda/killswitch/index.mjs"

type HandlerResult = { results: Array<Record<string, unknown>> }

function snsRecord(
  message: string,
  overrides: Partial<{ EventSource: string; TopicArn: string }> = {},
): {
  EventSource: string
  Sns: { Message: string; MessageId: string; TopicArn: string }
} {
  return {
    EventSource: overrides.EventSource ?? "aws:sns",
    Sns: {
      Message: message,
      MessageId: "msg-" + Math.random(),
      TopicArn: overrides.TopicArn ?? TEST_TOPIC_ARN,
    },
  }
}

describe("killswitch handler", () => {
  beforeEach(() => {
    send.mockReset()
    send.mockImplementation(async (cmd: { __type: string }) => {
      if (cmd.__type === "Describe") {
        return { services: [{ desiredCount: 1, status: "ACTIVE" }] }
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

  it("skips alarm whose name is unknown (not in allowlist)", async () => {
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

  it("skips alarm whose name only partially matches an allowlisted name", async () => {
    // Substring matching used to accept this; allowlist now requires
    // exact equality.
    const message = JSON.stringify({
      AlarmName: "evil-fargate-cpu-critical-and-then-some",
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
          "AWS Budget Notification: actual spend exceeded 100% of monorepo-test-monthlytotal.",
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

  it("skips an empty / non-Budget non-JSON message (no spurious stop)", async () => {
    const result = (await handler({
      Records: [snsRecord("")],
    })) as HandlerResult

    expect(result.results[0]?.action).toBe("skip")
    expect(result.results[0]?.reason).toBe("non-budget-non-json")
    const updateCalls = send.mock.calls.filter(
      ([c]) => (c as { __type: string }).__type === "Update",
    )
    expect(updateCalls.length).toBe(0)
  })

  it("rejects an event from a non-SNS source", async () => {
    const result = (await handler({
      Records: [
        snsRecord(
          JSON.stringify({
            AlarmName: "monorepo-test-fargate-network-out-high",
            NewStateValue: "ALARM",
          }),
          { EventSource: "aws:s3" },
        ),
      ],
    })) as HandlerResult

    expect(result.results[0]?.action).toBe("skip")
    expect(result.results[0]?.reason).toBe("wrong-event-source")
  })

  it("rejects an SNS record from an unexpected topic ARN", async () => {
    const result = (await handler({
      Records: [
        snsRecord(
          JSON.stringify({
            AlarmName: "monorepo-test-fargate-network-out-high",
            NewStateValue: "ALARM",
          }),
          { TopicArn: "arn:aws:sns:eu-west-1:000000000000:OtherTopic" },
        ),
      ],
    })) as HandlerResult

    expect(result.results[0]?.action).toBe("skip")
    expect(result.results[0]?.reason).toBe("wrong-topic-arn")
  })

  it("rethrows after the batch when ECS errors so Lambda Errors metric ticks", async () => {
    send.mockImplementation(async (cmd: { __type: string }) => {
      if (cmd.__type === "Describe") {
        throw new Error("DescribeServices network failure")
      }
      return {}
    })
    await expect(
      handler({
        Records: [
          snsRecord(
            JSON.stringify({
              AlarmName: "monorepo-test-fargate-network-out-high",
              NewStateValue: "ALARM",
            }),
          ),
        ],
      }),
    ).rejects.toThrow(/ECS action\(s\) failed/)
  })

  it("skips ECS when desiredCount is missing on the response", async () => {
    send.mockImplementation(async (cmd: { __type: string }) => {
      if (cmd.__type === "Describe") {
        return { services: [{ status: "ACTIVE" }] }
      }
      return {}
    })
    const result = (await handler({
      Records: [
        snsRecord(
          JSON.stringify({
            AlarmName: "monorepo-test-fargate-network-out-high",
            NewStateValue: "ALARM",
          }),
        ),
      ],
    })) as HandlerResult

    expect(result.results[0]?.action).toBe("skip")
    expect(result.results[0]?.reason).toBe("missing-desired-count")
  })

  it("no-ops on alarm fire when desiredCount is already 0 (idempotent)", async () => {
    send.mockImplementation(async (cmd: { __type: string }) => {
      if (cmd.__type === "Describe") {
        return { services: [{ desiredCount: 0, status: "ACTIVE" }] }
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
