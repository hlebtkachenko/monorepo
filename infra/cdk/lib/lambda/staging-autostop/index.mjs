// Staging auto-stop (scheduled).
//
// Triggered by an EventBridge schedule (every 30 min). Stops the staging
// environment once its running task has been up longer than MAX_UPTIME_HOURS,
// so a forgotten "I'll shut it down later" cannot quietly run for days
// (AFF cost review 2026-05-31; see docs/runbooks/STAGING.md).
//
// This is a MAX-UPTIME TTL, not true request-level inactivity: traffic
// terminates at Cloudflare (no ALB), so ECS has no cheap request signal. The
// task's oldest startedAt is the uptime clock. A genuinely-needed long session
// just gets restarted (one command); staging carries no uptime obligation.
//
// On trip it stops ECS (desiredCount=0) AND RDS (reversible) + tags
// cost-stop-requested=true (so the RdsRestartWatcher keeps RDS down), then
// publishes a notice to the ops SNS topic so the operator knows it happened.
//
// Required env vars:
//   CLUSTER_NAME              ECS cluster name
//   SERVICE_NAME              ECS service name
//   MAX_UPTIME_HOURS          stop once the oldest running task exceeds this
// Optional env vars:
//   RDS_INSTANCE_IDENTIFIER   RDS instance to stop alongside ECS
//   OPS_TOPIC_ARN             SNS topic to notify on auto-stop

import {
  DescribeServicesCommand,
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs"
import {
  AddTagsToResourceCommand,
  DescribeDBInstancesCommand,
  RDSClient,
  StopDBInstanceCommand,
} from "@aws-sdk/client-rds"
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns"

const ecs = new ECSClient({})
const rds = new RDSClient({})
const sns = new SNSClient({})

const CLUSTER_NAME = process.env.CLUSTER_NAME
const SERVICE_NAME = process.env.SERVICE_NAME
const MAX_UPTIME_HOURS = Number(process.env.MAX_UPTIME_HOURS ?? "5")
const RDS_INSTANCE_IDENTIFIER = process.env.RDS_INSTANCE_IDENTIFIER
const OPS_TOPIC_ARN = process.env.OPS_TOPIC_ARN

function log(event, fields) {
  console.log(JSON.stringify({ event, ...fields }))
}

async function oldestRunningTaskAgeMs() {
  const list = await ecs.send(
    new ListTasksCommand({
      cluster: CLUSTER_NAME,
      serviceName: SERVICE_NAME,
      desiredStatus: "RUNNING",
    }),
  )
  const taskArns = list.taskArns ?? []
  if (taskArns.length === 0) return null
  const desc = await ecs.send(
    new DescribeTasksCommand({ cluster: CLUSTER_NAME, tasks: taskArns }),
  )
  const startedAts = (desc.tasks ?? [])
    .map((t) => (t.startedAt ? new Date(t.startedAt).getTime() : null))
    .filter((t) => typeof t === "number")
  if (startedAts.length === 0) return null
  const oldest = Math.min(...startedAts)
  return Date.now() - oldest
}

async function stopRds() {
  if (!RDS_INSTANCE_IDENTIFIER) return { action: "skip", reason: "no-rds" }
  const desc = await rds.send(
    new DescribeDBInstancesCommand({
      DBInstanceIdentifier: RDS_INSTANCE_IDENTIFIER,
    }),
  )
  const db = desc.DBInstances?.[0]
  if (!db || db.DBInstanceStatus !== "available") {
    return {
      action: "noop",
      reason: `rds-${db?.DBInstanceStatus ?? "missing"}`,
    }
  }
  if (db.DBInstanceArn) {
    await rds.send(
      new AddTagsToResourceCommand({
        ResourceName: db.DBInstanceArn,
        Tags: [{ Key: "cost-stop-requested", Value: "true" }],
      }),
    )
  }
  await rds.send(
    new StopDBInstanceCommand({
      DBInstanceIdentifier: RDS_INSTANCE_IDENTIFIER,
    }),
  )
  return { action: "stop-rds" }
}

async function notify(message) {
  if (!OPS_TOPIC_ARN) return
  try {
    await sns.send(
      new PublishCommand({
        TopicArn: OPS_TOPIC_ARN,
        Subject: "Staging auto-stopped (cost)",
        Message: message,
      }),
    )
  } catch (err) {
    log("notify-threw", { err: String(err) })
  }
}

export const handler = async () => {
  if (!CLUSTER_NAME || !SERVICE_NAME) {
    throw new Error(
      "staging-autostop: CLUSTER_NAME + SERVICE_NAME env vars are required.",
    )
  }

  const desc = await ecs.send(
    new DescribeServicesCommand({
      cluster: CLUSTER_NAME,
      services: [SERVICE_NAME],
    }),
  )
  const svc = desc.services?.[0]
  if (!svc || svc.status !== "ACTIVE") {
    log("service-not-active", { status: svc?.status })
    return { action: "skip", reason: "service-not-active" }
  }
  if (svc.desiredCount === 0) {
    log("already-stopped", {})
    return { action: "noop", reason: "already-stopped" }
  }

  const ageMs = await oldestRunningTaskAgeMs()
  if (ageMs === null) {
    log("no-running-task-age", {})
    return { action: "skip", reason: "no-running-task-age" }
  }
  const ageHours = ageMs / 3_600_000
  if (ageHours < MAX_UPTIME_HOURS) {
    log("within-ttl", { ageHours, MAX_UPTIME_HOURS })
    return { action: "noop", reason: "within-ttl", ageHours }
  }

  await ecs.send(
    new UpdateServiceCommand({
      cluster: CLUSTER_NAME,
      service: SERVICE_NAME,
      desiredCount: 0,
    }),
  )
  const rdsResult = await stopRds()
  log("staging-auto-stopped", { ageHours, rds: rdsResult })
  await notify(
    `Staging was running ${ageHours.toFixed(1)}h (> ${MAX_UPTIME_HOURS}h TTL) and has been auto-stopped to cap cost. ECS desiredCount=0; RDS ${rdsResult.action}. Restart per docs/runbooks/STAGING.md.`,
  )
  return { action: "stop", ageHours, rds: rdsResult }
}
