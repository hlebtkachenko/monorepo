import { beforeEach, describe, expect, it, vi } from "vitest"

const { ecsSend, rdsSend, snsSend } = vi.hoisted(() => {
  process.env.CLUSTER_NAME = "monorepo-staging"
  process.env.SERVICE_NAME = "monorepo-staging-svc"
  process.env.RDS_INSTANCE_IDENTIFIER = "monorepo-staging-db"
  process.env.MAX_UPTIME_HOURS = "5"
  process.env.OPS_TOPIC_ARN = "arn:aws:sns:eu-west-1:123456789012:Ops"
  return { ecsSend: vi.fn(), rdsSend: vi.fn(), snsSend: vi.fn() }
})

vi.mock("@aws-sdk/client-ecs", () => {
  class ECSClient {
    send = ecsSend
  }
  const mk = (t: string) =>
    class {
      __type = t
      input: unknown
      constructor(input: unknown) {
        this.input = input
      }
    }
  return {
    ECSClient,
    DescribeServicesCommand: mk("DescribeServices"),
    ListTasksCommand: mk("ListTasks"),
    DescribeTasksCommand: mk("DescribeTasks"),
    UpdateServiceCommand: mk("UpdateService"),
  }
})

vi.mock("@aws-sdk/client-rds", () => {
  class RDSClient {
    send = rdsSend
  }
  const mk = (t: string) =>
    class {
      __type = t
      input: unknown
      constructor(input: unknown) {
        this.input = input
      }
    }
  return {
    RDSClient,
    DescribeDBInstancesCommand: mk("RdsDescribe"),
    StopDBInstanceCommand: mk("RdsStop"),
    AddTagsToResourceCommand: mk("RdsAddTags"),
  }
})

vi.mock("@aws-sdk/client-sns", () => {
  class SNSClient {
    send = snsSend
  }
  const mk = (t: string) =>
    class {
      __type = t
      input: unknown
      constructor(input: unknown) {
        this.input = input
      }
    }
  return { SNSClient, PublishCommand: mk("Publish") }
})

// @ts-expect-error - .mjs handler ships without declaration types
import { handler } from "../lib/lambda/staging-autostop/index.mjs"

const HOUR = 3_600_000

function ecsWithTaskAgeHours(hours: number, desiredCount = 1) {
  return async (cmd: { __type: string }) => {
    if (cmd.__type === "DescribeServices") {
      return { services: [{ status: "ACTIVE", desiredCount }] }
    }
    if (cmd.__type === "ListTasks") return { taskArns: ["arn:task/1"] }
    if (cmd.__type === "DescribeTasks") {
      return { tasks: [{ startedAt: new Date(Date.now() - hours * HOUR) }] }
    }
    return {}
  }
}

describe("staging-autostop handler", () => {
  beforeEach(() => {
    ecsSend.mockReset()
    rdsSend.mockReset()
    snsSend.mockReset()
    rdsSend.mockImplementation(async (cmd: { __type: string }) => {
      if (cmd.__type === "RdsDescribe") {
        return {
          DBInstances: [
            {
              DBInstanceStatus: "available",
              DBInstanceArn:
                "arn:aws:rds:eu-west-1:123456789012:db:monorepo-staging-db",
            },
          ],
        }
      }
      return {}
    })
    snsSend.mockResolvedValue({})
  })

  it("stops staging when the task has run past the TTL", async () => {
    ecsSend.mockImplementation(ecsWithTaskAgeHours(6))
    const result = (await handler()) as { action: string }
    expect(result.action).toBe("stop")
    const updates = ecsSend.mock.calls.filter(
      ([c]) => (c as { __type: string }).__type === "UpdateService",
    )
    const rdsStops = rdsSend.mock.calls.filter(
      ([c]) => (c as { __type: string }).__type === "RdsStop",
    )
    expect(updates.length).toBe(1)
    expect(rdsStops.length).toBe(1)
    expect(snsSend.mock.calls.length).toBe(1)
  })

  it("no-ops while the task is still within the TTL", async () => {
    ecsSend.mockImplementation(ecsWithTaskAgeHours(1))
    const result = (await handler()) as { action: string; reason?: string }
    expect(result.action).toBe("noop")
    expect(result.reason).toBe("within-ttl")
    const updates = ecsSend.mock.calls.filter(
      ([c]) => (c as { __type: string }).__type === "UpdateService",
    )
    expect(updates.length).toBe(0)
  })

  it("no-ops when staging is already scaled to zero", async () => {
    ecsSend.mockImplementation(ecsWithTaskAgeHours(99, 0))
    const result = (await handler()) as { action: string; reason?: string }
    expect(result.action).toBe("noop")
    expect(result.reason).toBe("already-stopped")
  })
})
