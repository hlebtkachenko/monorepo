// SNS-triggered cost kill-switch.
//
// Subscribed to one SNS topic (KillSwitchTopic). Two message shapes arrive:
//
//   1. CloudWatch alarm JSON envelope (AlarmName + NewStateValue). Stops
//      ECS only when NewStateValue === "ALARM" AND the alarm name appears
//      in KILL_SWITCH_ALARM_NAMES (an exact-match allowlist injected from
//      CDK so a name collision can never trigger production).
//
//   2. AWS Budgets notification (plain text, NOT JSON). The 100%-threshold
//      notification publishes to KillSwitchTopic (80% is email-only). The
//      handler matches a positive Budget anchor ("AWS Budget Notification"
//      or "AWSBudgets") rather than treating "anything non-JSON" as a
//      budget breach — a future AWS payload-format change must not
//      silently stop production.
//
// RDS-network-out-high never reaches this Lambda (alarm-only, mid-query
// stop risks DB corruption). Repeated SNS retries detect desiredCount=0
// and no-op so the action is idempotent.
//
// On a stop trigger the handler stops ECS (desiredCount=0) AND, when
// RDS_INSTANCE_IDENTIFIER is set, stops that env's RDS instance — RDS is the
// largest always-on cost and stopping it is fully reversible (AFF cost review
// 2026-05-31). The RDS stop is best-effort: it tags cost-stop-requested=true
// so the RdsRestartWatcher re-stops after AWS's ~7-day forced restart, and an
// RDS failure is logged but does not mask the ECS stop.
//
// Required env vars:
//   CLUSTER_NAME              ECS cluster name
//   SERVICE_NAME              ECS service name
//   EXPECTED_TOPIC_ARN        SNS topic ARN that may trigger this Lambda
//   KILL_SWITCH_ALARM_NAMES   comma-separated allowlist of CW alarm names
// Optional env vars:
//   RDS_INSTANCE_IDENTIFIER   RDS instance to stop alongside ECS

import {
  DescribeServicesCommand,
  ECSClient,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs"
import {
  AddTagsToResourceCommand,
  DescribeDBInstancesCommand,
  RDSClient,
  StopDBInstanceCommand,
} from "@aws-sdk/client-rds"

const ecs = new ECSClient({})
const rds = new RDSClient({})

const CLUSTER_NAME = process.env.CLUSTER_NAME
const SERVICE_NAME = process.env.SERVICE_NAME
const RDS_INSTANCE_IDENTIFIER = process.env.RDS_INSTANCE_IDENTIFIER
const EXPECTED_TOPIC_ARN = process.env.EXPECTED_TOPIC_ARN
const ALLOWED_ALARM_NAMES = new Set(
  (process.env.KILL_SWITCH_ALARM_NAMES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
)

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
  if (Array.isArray(current.failures) && current.failures.length > 0) {
    log("describe-services-failures", { failures: current.failures })
  }
  const svc = current.services?.[0]
  if (!svc) {
    log("service-not-found", { SERVICE_NAME })
    return { action: "skip", reason: "service-not-found" }
  }
  if (svc.status !== "ACTIVE") {
    log("service-not-active", { SERVICE_NAME, status: svc.status })
    return { action: "skip", reason: "service-not-active" }
  }
  if (typeof svc.desiredCount !== "number") {
    log("service-missing-desiredCount", { SERVICE_NAME })
    return { action: "skip", reason: "missing-desired-count" }
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

// Stops the env's RDS instance and tags it cost-stop-requested=true so the
// RdsRestartWatcher keeps it down past AWS's 7-day forced restart. Best-effort
// and idempotent: no-ops when the DB is not in `available` state (already
// stopping/stopped), and never throws — an RDS failure is logged and returned
// as { action: "error" } rather than masking the ECS stop the caller already
// performed.
async function stopRdsInstance(reason) {
  if (!RDS_INSTANCE_IDENTIFIER) {
    return { action: "skip", reason: "no-rds-configured" }
  }
  try {
    const desc = await rds.send(
      new DescribeDBInstancesCommand({
        DBInstanceIdentifier: RDS_INSTANCE_IDENTIFIER,
      }),
    )
    const db = desc.DBInstances?.[0]
    if (!db) {
      log("rds-not-found", { RDS_INSTANCE_IDENTIFIER })
      return { action: "skip", reason: "rds-not-found" }
    }
    if (db.DBInstanceStatus !== "available") {
      log("rds-not-available", { status: db.DBInstanceStatus })
      return { action: "noop", reason: `rds-${db.DBInstanceStatus}` }
    }
    // Tag BEFORE stopping so the RdsRestartWatcher sees the intent even if
    // the StopDBInstance call is what flips the instance out of `available`.
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
    log("rds-stopped", { reason, RDS_INSTANCE_IDENTIFIER })
    return { action: "stop-rds", reason }
  } catch (err) {
    log("rds-stop-threw", { err: String(err) })
    return { action: "error", reason: String(err) }
  }
}

// Stop the whole env: ECS first (the request-serving compute), then RDS.
// stopEcsService may throw (network failure) and that propagates to the
// caller's try/catch so the Lambda Errors metric ticks; stopRdsInstance is
// reached only when ECS did not throw and never throws itself.
async function stopEnv(reason) {
  const ecsResult = await stopEcsService(reason)
  const rdsResult = await stopRdsInstance(reason)
  return { ...ecsResult, rds: rdsResult }
}

function isKnownAlarm(alarmName) {
  if (!alarmName) return false
  return ALLOWED_ALARM_NAMES.has(alarmName)
}

function isBudgetNotification(raw) {
  if (typeof raw !== "string") return false
  return raw.includes("AWS Budget Notification") || raw.includes("AWSBudgets")
}

export const handler = async (event) => {
  // Boot-time invariants: missing env = misconfigured deployment. Throw
  // so the CloudWatch Lambda Errors metric increments and the
  // KillSwitchErrorsAlarm fires.
  if (!EXPECTED_TOPIC_ARN) {
    throw new Error(
      "killswitch: EXPECTED_TOPIC_ARN env var is required (set by CDK security-stack).",
    )
  }
  if (ALLOWED_ALARM_NAMES.size === 0) {
    throw new Error(
      "killswitch: KILL_SWITCH_ALARM_NAMES env var must list at least one alarm name.",
    )
  }

  const results = []
  // Collect ECS errors per record but rethrow at the end. Per-record
  // logging gives ops a complete batch result; the final throw makes
  // the Lambda Errors metric tick so KillSwitchErrorsAlarm fires.
  const ecsErrors = []
  for (const record of event.Records ?? []) {
    // Source verification: only accept records routed by SNS from our
    // expected topic ARN. Defends against the Lambda being invoked
    // through any other path (cross-account misconfiguration, test
    // payloads, future trigger source mistakes).
    if (record.EventSource !== "aws:sns") {
      log("rejected-event-source", { source: record.EventSource })
      results.push({ action: "skip", reason: "wrong-event-source" })
      continue
    }
    if (record.Sns?.TopicArn !== EXPECTED_TOPIC_ARN) {
      log("rejected-topic-arn", { topicArn: record.Sns?.TopicArn })
      results.push({ action: "skip", reason: "wrong-topic-arn" })
      continue
    }

    const raw = record.Sns?.Message ?? ""
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Non-JSON path: only stop ECS when the body positively anchors
      // as an AWS Budgets notification. An empty / future-format /
      // garbage payload would otherwise have stopped production.
      if (!isBudgetNotification(raw)) {
        log("non-budget-non-json", { messageId: record.Sns?.MessageId })
        results.push({
          action: "skip",
          reason: "non-budget-non-json",
        })
        continue
      }
      log("budget-notification", { messageId: record.Sns?.MessageId })
      try {
        results.push({
          source: "budget",
          ...(await stopEnv("budget-breach")),
        })
      } catch (err) {
        log("ecs-stop-threw", { err: String(err) })
        results.push({
          source: "budget",
          action: "error",
          reason: String(err),
        })
        ecsErrors.push(err)
      }
      continue
    }
    const alarmName = parsed.AlarmName
    const newState = parsed.NewStateValue
    log("received", { alarmName, newState })
    if (newState !== "ALARM") {
      results.push({ alarmName, action: "skip", reason: "not-in-alarm-state" })
      continue
    }
    if (isKnownAlarm(alarmName)) {
      try {
        results.push({ alarmName, ...(await stopEnv(alarmName)) })
      } catch (err) {
        log("ecs-stop-threw", { alarmName, err: String(err) })
        results.push({ alarmName, action: "error", reason: String(err) })
        ecsErrors.push(err)
      }
    } else {
      log("unknown-alarm", { alarmName })
      results.push({ alarmName, action: "skip", reason: "unknown-alarm" })
    }
  }
  if (ecsErrors.length > 0) {
    // Re-raise after the batch so the Lambda Errors metric increments
    // (which KillSwitchErrorsAlarm watches). The per-record results are
    // already logged for ops to triage.
    const err = new Error(
      `killswitch: ${ecsErrors.length} ECS action(s) failed; see ecs-stop-threw logs.`,
    )
    err.cause = ecsErrors
    err.results = results
    throw err
  }
  return { results }
}
