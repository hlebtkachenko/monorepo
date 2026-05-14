// SNS-triggered cost kill-switch.
//
// Receives a CloudWatch alarm notification fanned out via SNS, parses the
// alarm name, and dispatches one action: stop the ECS service
// (desiredCount=0). Triggered alarms:
//
//   - fargate-network-out-high
//   - cwlogs-ingest-high
//   - s3-put-rate-high
//   - *-cpu-critical / *-memory-critical
//
// RDS-network-out-high never triggers the kill-switch (aborting an in-flight
// DB transaction risks state corruption) - SNS email-only.
//
// All actions are idempotent. Repeated SNS retries detect desiredCount=0 and
// no-op.
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

function shouldStop(alarmName) {
  if (!alarmName) return false
  return (
    alarmName.includes("fargate-network-out-high") ||
    alarmName.includes("cwlogs-ingest-high") ||
    alarmName.includes("s3-put-rate-high") ||
    alarmName.includes("cpu-critical") ||
    alarmName.includes("memory-critical") ||
    alarmName.includes("budget-")
  )
}

export const handler = async (event) => {
  const results = []
  for (const record of event.Records ?? []) {
    let message
    try {
      message = JSON.parse(record.Sns.Message)
    } catch {
      log("unparseable-sns-message", { messageId: record.Sns.MessageId })
      continue
    }
    const alarmName = message.AlarmName ?? message.budgetName
    const newState = message.NewStateValue
    log("received", { alarmName, newState })
    if (newState && newState !== "ALARM") {
      results.push({ alarmName, action: "skip", reason: "not-in-alarm-state" })
      continue
    }
    if (shouldStop(alarmName)) {
      results.push({ alarmName, ...(await stopEcsService(alarmName)) })
    } else {
      log("unknown-alarm", { alarmName })
      results.push({ alarmName, action: "skip", reason: "unknown-alarm" })
    }
  }
  return { results }
}
