// EventBridge-triggered RDS auto-restart watcher.
//
// AWS forcibly restarts stopped RDS instances after ~7 days. When a budget
// action or operator manually stopped the DB to cap costs, this watcher
// re-issues StopDBInstance to keep the DB down. It only acts when the DB
// is tagged `cost-stop-requested=true`, set by the kill-switch or runbook
// when stop is intentional. Without the tag, normal AWS-triggered starts
// are left alone.
//
// Triggered by EventBridge rule on `source=aws.rds`, `detail-type='RDS DB
// Instance Event'`. The Lambda inspects the event message to confirm the
// instance is in `available` state (i.e., the start completed) before
// issuing the stop.
//
// Required env vars:
//   DB_INSTANCE_IDENTIFIER  the RDS instance to watch

import {
  DescribeDBInstancesCommand,
  ListTagsForResourceCommand,
  RDSClient,
  StopDBInstanceCommand,
} from "@aws-sdk/client-rds"

const rds = new RDSClient({})

const DB_INSTANCE_IDENTIFIER = process.env.DB_INSTANCE_IDENTIFIER

function log(event, fields) {
  console.log(JSON.stringify({ event, ...fields }))
}

export const handler = async (event) => {
  log("received", { detail: event.detail })

  if (!DB_INSTANCE_IDENTIFIER) {
    log("missing-env", { DB_INSTANCE_IDENTIFIER })
    return { action: "skip", reason: "missing-env" }
  }

  // EventBridge gives the source identifier in different shapes between
  // events; only act on this Lambda's configured instance.
  const sourceId = event.detail?.SourceIdentifier ?? event.detail?.SourceArn
  if (sourceId && !sourceId.includes(DB_INSTANCE_IDENTIFIER)) {
    log("not-our-instance", { sourceId })
    return { action: "skip", reason: "not-our-instance" }
  }

  const desc = await rds.send(
    new DescribeDBInstancesCommand({
      DBInstanceIdentifier: DB_INSTANCE_IDENTIFIER,
    }),
  )
  const db = desc.DBInstances?.[0]
  if (!db) {
    log("db-not-found", { DB_INSTANCE_IDENTIFIER })
    return { action: "skip", reason: "db-not-found" }
  }
  if (db.DBInstanceStatus !== "available") {
    log("db-not-available", { status: db.DBInstanceStatus })
    return { action: "skip", reason: "db-not-available" }
  }

  const tagsResp = await rds.send(
    new ListTagsForResourceCommand({ ResourceName: db.DBInstanceArn }),
  )
  const hasStopTag = tagsResp.TagList?.some(
    (t) => t.Key === "cost-stop-requested" && t.Value === "true",
  )
  if (!hasStopTag) {
    log("not-tagged-for-stop", { DB_INSTANCE_IDENTIFIER })
    return { action: "skip", reason: "not-tagged-for-stop" }
  }

  await rds.send(
    new StopDBInstanceCommand({
      DBInstanceIdentifier: DB_INSTANCE_IDENTIFIER,
    }),
  )
  log("db-stopped", { DB_INSTANCE_IDENTIFIER })
  return { action: "stop-rds", DB_INSTANCE_IDENTIFIER }
}
