// Env auto-cold-pause (scheduled).
//
// Triggered by an EventBridge schedule (every 30 min). Cold-pauses the env
// (ECS desiredCount=0 + RDS stop) once its running task has been up longer
// than MAX_UPTIME_HOURS, so a forgotten "I'll shut it down later" cannot
// quietly run for days (AFF cost review 2026-05-31; see
// docs/runbooks/ENV-POWER.md). Runs on staging and (pre-v1) production.
//
// This is a MAX-UPTIME TTL, not true request-level inactivity: traffic
// terminates at Cloudflare (no ALB), so ECS has no cheap request signal. The
// task's oldest startedAt is the uptime clock. A still-needed session is just
// resumed via the Env Power workflow (one command).
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
//   ENV_NAME                  "staging" | "production" — picks which hosts to
//                             bind the sleeping page on
//   CF_ROUTES_TOKEN_PARAM     SSM SecureString name holding a Cloudflare API
//                             token (Zone:Read + Workers Routes:Edit). When
//                             set, on cold-pause the lambda binds the
//                             afframe-sleeping Worker to this env's hosts so an
//                             auto-paused env shows the sleeping page instead of
//                             Cloudflare error 1033. Best-effort: a CF failure
//                             never fails the cost-pause.
//   CF_ZONE_NAME              Cloudflare zone (default "afframe.com")
//   SLEEPING_SCRIPT_NAME      Worker script name (default "afframe-sleeping")

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
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm"

const ecs = new ECSClient({})
const rds = new RDSClient({})
const sns = new SNSClient({})
const ssm = new SSMClient({})

const CLUSTER_NAME = process.env.CLUSTER_NAME
const SERVICE_NAME = process.env.SERVICE_NAME
const MAX_UPTIME_HOURS = Number(process.env.MAX_UPTIME_HOURS ?? "5")
const RDS_INSTANCE_IDENTIFIER = process.env.RDS_INSTANCE_IDENTIFIER
const OPS_TOPIC_ARN = process.env.OPS_TOPIC_ARN

const ENV_NAME = process.env.ENV_NAME
const CF_ROUTES_TOKEN_PARAM = process.env.CF_ROUTES_TOKEN_PARAM
const CF_ZONE_NAME = process.env.CF_ZONE_NAME ?? "afframe.com"
const SLEEPING_SCRIPT_NAME =
  process.env.SLEEPING_SCRIPT_NAME ?? "afframe-sleeping"

// Same per-env host set as infra/cloudflare-sleeping/scripts/routes.sh.
const SLEEPING_HOSTS = {
  staging: [
    "app-staging.afframe.com/*",
    "api-staging.afframe.com/*",
    "admin-staging.afframe.com/*",
  ],
  production: ["app.afframe.com/*", "api.afframe.com/*", "admin.afframe.com/*"],
}

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

// Best-effort: bind the afframe-sleeping Worker to this env's hosts so the
// auto-paused env shows the sleeping page instead of Cloudflare error 1033.
// Mirrors `routes.sh on <env>`. Any failure (unconfigured token, CF API error)
// is swallowed — the cost-pause must succeed regardless.
async function bindSleepingRoutes() {
  if (!CF_ROUTES_TOKEN_PARAM || !ENV_NAME) {
    return { action: "skip", reason: "cf-not-configured" }
  }
  const hosts = SLEEPING_HOSTS[ENV_NAME]
  if (!hosts) return { action: "skip", reason: `no-hosts-for-${ENV_NAME}` }
  try {
    const param = await ssm.send(
      new GetParameterCommand({
        Name: CF_ROUTES_TOKEN_PARAM,
        WithDecryption: true,
      }),
    )
    const token = param.Parameter?.Value
    if (!token) return { action: "skip", reason: "empty-token" }
    const headers = { Authorization: `Bearer ${token}` }

    const zoneRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${CF_ZONE_NAME}`,
      { headers },
    )
    const zoneJson = await zoneRes.json()
    const zoneId = zoneJson?.result?.[0]?.id
    if (!zoneId) return { action: "error", reason: "zone-not-found" }

    let bound = 0
    for (const pattern of hosts) {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ pattern, script: SLEEPING_SCRIPT_NAME }),
        },
      )
      const json = await res.json()
      // success, or already bound (duplicate route) — both are fine.
      if (json?.success || JSON.stringify(json).includes("duplicate")) {
        bound++
      } else {
        log("cf-route-bind-failed", { pattern, json })
      }
    }
    return { action: "bound", bound, of: hosts.length }
  } catch (err) {
    return { action: "error", reason: String(err) }
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
  const cfResult = await bindSleepingRoutes()
  log("staging-auto-stopped", {
    ageHours,
    rds: rdsResult,
    sleepingPage: cfResult,
  })
  await notify(
    `Staging was running ${ageHours.toFixed(1)}h (> ${MAX_UPTIME_HOURS}h TTL) and has been auto-stopped to cap cost. ECS desiredCount=0; RDS ${rdsResult.action}; sleeping page ${cfResult.action}. Restart per docs/runbooks/STAGING.md.`,
  )
  return { action: "stop", ageHours, rds: rdsResult, sleepingPage: cfResult }
}
