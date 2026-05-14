// SNS-triggered cost kill-switch.
//
// Subscribed to one SNS topic (KillSwitchTopic). Two message shapes arrive:
//
//   1. CloudWatch alarm JSON envelope (AlarmName + NewStateValue). Stops
//      ECS only when NewStateValue === "ALARM" AND the alarm name matches
//      a known trigger (fargate-network-out-high, cwlogs-ingest-high,
//      s3-put-rate-high, *-cpu-critical, *-memory-critical).
//
//   2. AWS Budgets notification (plain text, NOT JSON). The 100%-threshold
//      notification is the only path that publishes to KillSwitchTopic
//      (80% is email-only) so any non-JSON message is treated as a budget
//      breach -> stop ECS.
//
// RDS-network-out-high never reaches this Lambda (alarm-only, mid-query
// stop risks DB corruption). Repeated SNS retries detect desiredCount=0
// and no-op so the action is idempotent.
//
// Required env vars:
//   CLUSTER_NAME    ECS cluster name
//   SERVICE_NAME    ECS service name

import {
  DescribeServicesCommand,
  ECSClient,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs"

const ecs = new ECSClient({})

const CLUSTER_NAME = process.env.CLUSTER_NAME
const SERVICE_NAME = process.env.SERVICE_NAME

function log(event, fields) {
  console.log(JSON.stringify({ event, ...fields }))
}

async function stopEcsService(reason) {
  if (!CLUSTER_NAME || !SERVICE_NAME) {
    log("missing-ecs-env", { CLUSTER_NAME, SERVICE_NAME })
    return { action: "skip", reason: "missing-ecs-env" }
  }
  const current = await ecs.send(
    new DescribeServicesCommand({
      cluster: CLUSTER_NAME,
      services: [SERVICE_NAME],
    }),
  )
  const svc = current.services?.[0]
  if (!svc) {
    log("service-not-found", { SERVICE_NAME })
    return { action: "skip", reason: "service-not-found" }
  }
  if (svc.desiredCount === 0) {
    log("service-already-stopped", { SERVICE_NAME })
    return { action: "noop", reason: "already-stopped" }
  }
  await ecs.send(
    new UpdateServiceCommand({
      cluster: CLUSTER_NAME,
      service: SERVICE_NAME,
      desiredCount: 0,
    }),
  )
  log("service-stopped", { reason, SERVICE_NAME })
  return { action: "stop-ecs", reason }
}

function isKnownAlarm(alarmName) {
  if (!alarmName) return false
  return (
    alarmName.includes("fargate-network-out-high") ||
    alarmName.includes("cwlogs-ingest-high") ||
    alarmName.includes("s3-put-rate-high") ||
    alarmName.includes("cpu-critical") ||
    alarmName.includes("memory-critical")
  )
}

export const handler = async (event) => {
  const results = []
  for (const record of event.Records ?? []) {
    const raw = record.Sns?.Message ?? ""
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Non-JSON payload on KillSwitchTopic = AWS Budgets plain-text
      // notification at the 100% threshold. Stop the service.
      log("budget-notification", { messageId: record.Sns?.MessageId })
      results.push({
        source: "budget",
        ...(await stopEcsService("budget-breach")),
      })
      continue
    }
    const alarmName = parsed.AlarmName
    const newState = parsed.NewStateValue
    log("received", { alarmName, newState })
    if (newState && newState !== "ALARM") {
      results.push({ alarmName, action: "skip", reason: "not-in-alarm-state" })
      continue
    }
    if (isKnownAlarm(alarmName)) {
      results.push({ alarmName, ...(await stopEcsService(alarmName)) })
    } else {
      log("unknown-alarm", { alarmName })
      results.push({ alarmName, action: "skip", reason: "unknown-alarm" })
    }
  }
  return { results }
}
