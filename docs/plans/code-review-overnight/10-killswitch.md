---
phase: 10-killswitch
reviewed: 2026-05-15T00:00:00Z
depth: deep
files_reviewed: 4
files_reviewed_list:
  - infra/cdk/lib/lambda/killswitch/index.mjs
  - infra/cdk/lib/security-stack.ts
  - infra/cdk/lib/observability-stack.ts
  - infra/cdk/tests/killswitch-handler.test.ts
findings:
  critical: 3
  warning: 8
  info: 5
  total: 16
status: issues_found
---

# Phase 10: Cost Kill-Switch Lambda Code Review

**Reviewed:** 2026-05-15
**Depth:** deep
**Files Reviewed:** 4
**Status:** issues_found

## Summary

The kill-switch Lambda is a small, intentionally simple SNS subscriber that stops the ECS service when an alarm or AWS Budgets breach fires. The design intent (ADR 0016) is sound and the IAM scope on the function role is tight (single cluster/service ARN). However the implementation has three correctness/security issues that need to be fixed before this code ships to a real account:

1. **Trigger source is not verified.** The handler does not check `TopicArn` on the SNS record. Any caller that gains `lambda:InvokeFunction` on this function, or any principal that can publish to the wrong SNS topic that ends up subscribed by mistake, can stop production. SNS topic resource policy does help (see security-stack.ts), but a `TopicArn` check is the cheap belt-and-braces inside the handler.
2. **Non-JSON fall-through silently equates "any garbled message" with "budget breach."** The `catch {}` branch fires on `""`, `null` payloads, partially delivered messages, or any future AWS service that publishes plain text. There is no positive signal that the text is actually an AWS Budgets notification.
3. **Plain-text Budget parsing has no schema check.** Tests assert that the substring "AWS Budgets Notification" works, but the handler does not actually look for that substring. The test is over-specified vs. the production code, hiding the real behaviour.

Beyond the three blockers there are concurrency, idempotency, error-propagation, and test-coverage gaps worth fixing. The IAM policy is correctly scoped, the function timeout is reasonable, and the absence of secrets/PII logging is good. Overall the bones are right but it needs hardening before going hot.

## Critical Issues

### CR-01: SNS trigger source is not verified inside the handler

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:80-112`
**Issue:** The handler iterates `event.Records` without ever inspecting `record.EventSource` or `record.Sns.TopicArn`. The function is reachable via `lambda:InvokeFunction` from any principal that has been granted that permission (or via misconfiguration of a different SNS topic that gets subscribed in a future change). There is also no validation that the record shape actually is an SNS record — a misrouted EventBridge / S3 event would crash later in `parsed.AlarmName` lookup but only after the side effect path has been entered.

The SNS topic resource policy in `security-stack.ts` does restrict publish to `budgets.amazonaws.com` plus CloudWatch alarms in the same account. That is good defense-in-depth at the topic. But the Lambda is the side-effect actor, and inside the Lambda the only check on "should I stop the service?" is `NewStateValue === "ALARM"` OR `JSON.parse threw`. There is no proof that the message came from the kill-switch topic.

Concretely: an operator who hand-tests the Lambda from the AWS console with `{ "Records": [{ "Sns": { "Message": "garbled" } }] }` will stop production.

**Fix:** Validate `EventSource` and `TopicArn` against an env-injected expected ARN:

```js
const EXPECTED_TOPIC_ARN = process.env.EXPECTED_TOPIC_ARN

// inside the loop:
if (record.EventSource !== "aws:sns") {
  log("non-sns-event", { eventSource: record.EventSource })
  results.push({ action: "skip", reason: "non-sns-event" })
  continue
}
if (
  EXPECTED_TOPIC_ARN &&
  record.Sns?.TopicArn !== EXPECTED_TOPIC_ARN
) {
  log("unexpected-topic", { topicArn: record.Sns?.TopicArn })
  results.push({ action: "skip", reason: "unexpected-topic" })
  continue
}
```

And wire `EXPECTED_TOPIC_ARN: this.killSwitchTopic.topicArn` into the Lambda environment in `security-stack.ts`.

---

### CR-02: Non-JSON fall-through treats every parse failure as a budget breach

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:85-96`
**Issue:** The `catch {}` block makes the dangerous assumption that any payload which fails `JSON.parse` is an AWS Budgets 100%-threshold notification, and unconditionally calls `stopEcsService("budget-breach")`. This is fragile in three ways:

1. **Empty / missing payload.** `record.Sns?.Message ?? ""` plus `JSON.parse("")` throws → service stops. A malformed SNS delivery, an undocumented SNS test message, or AWS's own SNS "subscription confirmation" message (which is JSON but with different fields, so this case is actually OK) would all flow down the budget path. An empty string definitely will.
2. **AWS payload format drift.** If AWS one day starts shipping Budgets notifications as JSON (they already do via Budgets Actions JSON), the `JSON.parse` succeeds, `parsed.AlarmName` is `undefined`, `isKnownAlarm(undefined)` returns false, and the handler logs `unknown-alarm` and skips. The kill-switch silently stops working. The test suite would still pass.
3. **Any future non-alarm publisher to this topic** (e.g. someone manually publishes a string for testing) stops production.

The comment in the source says "Non-JSON payload on KillSwitchTopic = AWS Budgets plain-text notification" but the code does not assert that the payload is from Budgets — it just trusts that the topic is locked down. That is conflating layer-1 (topic ACL) with layer-2 (handler logic) and is exactly the kind of unstated invariant that breaks when topic policy is later relaxed.

**Fix:** Match positively on the Budgets payload, not negatively on "JSON.parse failed." Real Budget plain-text payloads contain known anchor strings:

```js
function isBudgetNotification(raw) {
  if (!raw) return false
  // Real Budgets plain-text messages always contain "AWS Budget Notification"
  // and either "ACTUAL" or "FORECASTED" plus the budget name.
  return (
    raw.includes("AWS Budget Notification") ||
    raw.includes("AWSBudgets") // Budgets Actions payloads
  )
}

try {
  parsed = JSON.parse(raw)
} catch {
  if (isBudgetNotification(raw)) {
    log("budget-notification", { messageId: record.Sns?.MessageId })
    results.push({ source: "budget", ...(await stopEcsService("budget-breach")) })
  } else {
    log("unknown-non-json", {
      messageId: record.Sns?.MessageId,
      preview: raw.slice(0, 120),
    })
    results.push({ action: "skip", reason: "unrecognized-non-json" })
  }
  continue
}
```

Also handle the JSON-parsed-but-fields-missing case: if `parsed.AlarmName === undefined && parsed.AWSAccountId !== undefined` it might be a JSON Budgets Action payload — currently this just falls into `unknown-alarm` and is skipped, defeating the entire purpose of the kill-switch.

---

### CR-03: Race between concurrent invocations corrupts idempotency check

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:43-67`
**Issue:** The idempotency guard is a `DescribeServices` → check `desiredCount === 0` → `UpdateService` sequence with no locking. SNS-to-Lambda fan-out can invoke the function more than once in parallel (multiple alarms transition to ALARM in the same minute, or SNS retry overlaps with a Budget delivery). Two concurrent invocations both `DescribeServices` and see `desiredCount: 1`, both call `UpdateService` with `desiredCount: 0`. The second call is harmless because ECS dedupes by value — but the audit trail now shows two service-stopped events and `result.action === "stop-ecs"` twice in CloudWatch logs. Worse, if an operator manually re-scaled the service to 1 between the two DescribeServices calls, both invocations stop them again.

A stricter problem: if the alarm flaps OK → ALARM → OK → ALARM in a few minutes (CW alarm hysteresis with `evaluationPeriods=1` on the 5 attack-vector alarms), and someone re-scales the service to 1 in between, the next ALARM fires and stops it again. There is no cooloff or "we stopped this recently, do not re-stop." For the design intent (cost halt) this is arguably correct — but the unit test `idempotent` only proves that `desiredCount=0` does not call `UpdateService` again, not that re-scaling is honored.

**Fix:** Two-part fix:

1. Set the Lambda's `reservedConcurrentExecutions: 1` in `security-stack.ts` to prevent concurrent invocations:

```ts
this.killSwitchFn = new LambdaFunction(this, "KillSwitchFn", {
  // ...
  reservedConcurrentExecutions: 1,
  // ...
})
```

This is free and turns a possible race into deterministic serialization. SNS delivery may then back up briefly during a storm, but that is fine — we want exactly-once stop semantics here.

2. (Optional, lower priority) Add a tag check: if the service has tag `cost-stop-suppress=true` set by an operator who is actively investigating, no-op. Same pattern used by the rds-restart-watcher, gives a manual override knob without redeploying.

## Warnings

### WR-01: `stopEcsService` swallows nothing — but its callers do not handle thrown errors

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:43-66, 80-112`
**Issue:** `ecs.send(...)` can throw (throttling, transient API failure, IAM revocation). The handler does not `try/catch` around `stopEcsService`. A thrown ECS error propagates out of `handler`, Lambda marks the invocation failed, SNS retries (default: 3 times with delay). Each retry repeats the same DescribeServices + UpdateService cycle. If the failure is IAM-permanent (e.g. role policy mis-edited), the alarm fires, retries all fail, the alarm is effectively un-actioned, and there is no `unknown-alarm` log line to investigate.

**Fix:** Wrap each per-record action in try/catch and record the error in `results` instead of throwing:

```js
try {
  results.push({ alarmName, ...(await stopEcsService(alarmName)) })
} catch (err) {
  log("stop-failed", {
    alarmName,
    error: err instanceof Error ? err.message : String(err),
    name: err?.name,
  })
  results.push({ alarmName, action: "error", reason: err?.name ?? "unknown" })
}
```

Return non-throwing results so all records in a batch are processed (one bad record currently halts the rest).

---

### WR-02: SNS subscription has no DLQ configured

**File:** `infra/cdk/lib/security-stack.ts:99-101`
**Issue:** `LambdaSubscription(this.killSwitchFn)` is constructed with no `deadLetterQueue`. Combined with WR-01, a permanently failing invocation falls off the cliff after 3 retries with no surface. The kill-switch is the most important function in the account; failures must be observable.

**Fix:** Wire a DLQ on the Lambda or the subscription, plus a CloudWatch alarm on DLQ message count:

```ts
import { Queue } from "aws-cdk-lib/aws-sqs"
const killSwitchDlq = new Queue(this, "KillSwitchDlq", {
  retentionPeriod: Duration.days(14),
  enforceSSL: true,
})

this.killSwitchTopic.addSubscription(
  new LambdaSubscription(this.killSwitchFn, {
    deadLetterQueue: killSwitchDlq,
  }),
)
```

Then add an alarm on `ApproximateNumberOfMessagesVisible >= 1` for the DLQ, wired to BillingTopic for email.

---

### WR-03: `NewStateValue` check is permissive on the unknown-state path

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:100-103`
**Issue:** The guard reads:

```js
if (newState && newState !== "ALARM") {
  results.push({ alarmName, action: "skip", reason: "not-in-alarm-state" })
  continue
}
```

If `parsed.NewStateValue` is `undefined` (malformed CloudWatch payload, or a non-alarm JSON message that happens to have an `AlarmName` field), the guard does not trip and execution falls through to `isKnownAlarm(alarmName)`. If a future payload format starts including `AlarmName` without `NewStateValue`, the kill-switch fires.

**Fix:** Require explicit `NewStateValue === "ALARM"`:

```js
if (newState !== "ALARM") {
  log("skip-non-alarm", { alarmName, newState })
  results.push({ alarmName, action: "skip", reason: "not-in-alarm-state" })
  continue
}
```

---

### WR-04: `isKnownAlarm` uses substring matching, opens up name-collision risk

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:69-78`
**Issue:** `alarmName.includes("cpu-critical")` matches anything containing that substring. A future alarm named `monorepo-prod-fargate-cpu-critical-experiment-do-not-fire` would still trigger the kill-switch. Also `s3-put-rate-high` could collide if someone names a different alarm `monorepo-test-s3-put-rate-high-rds-replica` or similar.

The full set of expected alarm names is finite and known at CDK synth time. Pass the exact names through Lambda env vars instead of substring-matching:

**Fix:** In `security-stack.ts`:

```ts
environment: {
  CLUSTER_NAME: props.appStack.cluster.clusterName,
  SERVICE_NAME: props.appStack.service.serviceName,
  EXPECTED_TOPIC_ARN: this.killSwitchTopic.topicArn,
  KILL_SWITCH_ALARM_NAMES: [
    props.observabilityStack.criticalAlarms.fargateCpu.alarmName,
    props.observabilityStack.criticalAlarms.fargateMemory.alarmName,
    props.observabilityStack.attackVectorAlarms.fargateNetworkOut.alarmName,
    props.observabilityStack.attackVectorAlarms.cwLogsIngest.alarmName,
    props.observabilityStack.attackVectorAlarms.s3PutRate.alarmName,
  ].join(","),
},
```

In handler:

```js
const KILL_SWITCH_ALARM_NAMES = new Set(
  (process.env.KILL_SWITCH_ALARM_NAMES ?? "").split(",").filter(Boolean),
)
function isKnownAlarm(alarmName) {
  return Boolean(alarmName) && KILL_SWITCH_ALARM_NAMES.has(alarmName)
}
```

This also kills the "RDS-network-out is alarm-only" risk from the source comment: the comment says RDS-network-out never reaches the Lambda, but only because no one wired `addAlarmAction(killSwitchAction)` on `rdsNetworkOut`. If a future contributor adds it and the handler does substring matching, "rds-network-out-high" does not match `network-out-high` because `fargate-network-out-high` is the substring — phew, but only by accident. Explicit allowlist makes the invariant load-bearing.

---

### WR-05: `services?.[0]` accepts an inconsistent ECS response

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:43-53`
**Issue:** `DescribeServices` can return entries in `failures[]` (e.g. service is mid-creation, IAM scope mismatch, cluster name typo). The code reads `current.services?.[0]` and ignores the failures array. If `services` is empty but `failures` has a "MISSING" entry, the handler logs `service-not-found` but never surfaces the actual reason. This blunts the observability on what is supposed to be the most critical function.

**Fix:**

```js
const svc = current.services?.[0]
if (!svc) {
  log("service-not-found", {
    SERVICE_NAME,
    failures: current.failures,
  })
  return { action: "skip", reason: "service-not-found" }
}
```

---

### WR-06: `desiredCount === 0` strict equality misses `undefined`

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:54-57`
**Issue:** If ECS returns the service object without a `desiredCount` field (rare, but possible during service deletion or under SDK version drift), `svc.desiredCount === 0` is false and the handler proceeds to call `UpdateService` against a being-deleted service. The result is an ECS "ServiceNotActive" error, which under WR-01 throws out of the Lambda. The conservative read here is "if I can't confirm desiredCount > 0, do not stop."

**Fix:**

```js
if (typeof svc.desiredCount !== "number") {
  log("service-state-unknown", { SERVICE_NAME, svc: { status: svc.status } })
  return { action: "skip", reason: "service-state-unknown" }
}
if (svc.desiredCount === 0) {
  log("service-already-stopped", { SERVICE_NAME })
  return { action: "noop", reason: "already-stopped" }
}
```

Also check `svc.status === "ACTIVE"` before issuing UpdateService.

---

### WR-07: No CloudWatch alarm on the kill-switch Lambda's own error metric

**File:** `infra/cdk/lib/security-stack.ts:67-97`
**Issue:** The Lambda function has a 30s timeout, 256 MB memory, and no alarm on its own `Errors`, `Throttles`, or `Duration` metric. If the function starts failing silently — IAM policy edit, regional outage, the ECS API throwing 5xx — the only signal is "the alarm fired and the bill still ran up." We need an alarm-on-the-alarm-handler.

**Fix:** Add a `cdk-monitoring-constructs` MonitoringFacade entry in `ObservabilityStack` or a manual `Alarm` on `AWS/Lambda Errors` for this function, with action on BillingTopic.

---

### WR-08: `process.env.CLUSTER_NAME` / `SERVICE_NAME` is read once at cold start; mutation in tests leaks

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:31-32`, `infra/cdk/tests/killswitch-handler.test.ts:3-7`
**Issue:** `const CLUSTER_NAME = process.env.CLUSTER_NAME` captures at module-init. The test file mutates `process.env.CLUSTER_NAME = "monorepo-test"` inside `vi.hoisted`, which runs before the import. That works today but breaks the moment a test wants to assert behaviour with `CLUSTER_NAME` unset (the missing-env branch on line 39-42). The test suite never exercises that branch, so it is dead-tested.

Also, reading from `process.env` once at module init means the handler cannot be re-configured per-invocation, which is the correct production behaviour but is a hidden constraint.

**Fix:** No code change required, but document the constraint and add a test for the missing-env branch:

```ts
// In a separate test file or with vi.resetModules:
it("skips when CLUSTER_NAME is unset", async () => {
  vi.resetModules()
  process.env.CLUSTER_NAME = undefined
  const { handler } = await import("../lib/lambda/killswitch/index.mjs")
  // ...
})
```

## Info

### IN-01: Test does not cover the "Budgets payload masquerading as JSON" case

**File:** `infra/cdk/tests/killswitch-handler.test.ts`
**Issue:** Tests cover (a) JSON alarm, (b) JSON OK state, (c) JSON unknown alarm, (d) plain-text Budgets, (e) idempotent already-stopped. Not covered:

- Empty `Sns.Message` string (CR-02 lights up here)
- `null` / missing `Sns.Message`
- Multiple records in a single SNS batch (different sources, one bad one good)
- ECS API throws (WR-01)
- `DescribeServices` returns `failures: [{ reason: "MISSING" }]`, `services: []`
- `desiredCount: undefined` in describe response (WR-06)
- Concurrent invocations / reservedConcurrentExecutions intent (CR-03)
- `NewStateValue` missing entirely from a JSON message that has `AlarmName`

**Fix:** Add the above cases. Particularly important: the budget-notification test currently passes because the message starts with `"AWS Budgets Notification:"` and `JSON.parse` fails. Add a test where the message is `""` — current code stops the service, which is wrong per CR-02.

---

### IN-02: Function-name comments are out of date with the alarm allowlist

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:1-17`
**Issue:** The header comment says known alarms are `fargate-network-out-high, cwlogs-ingest-high, s3-put-rate-high, *-cpu-critical, *-memory-critical`. The actual `addAlarmAction(killSwitchAction)` calls in `observability-stack.ts` are:

- `FargateCpuCritical` (line 131) — yes
- `FargateMemoryCritical` (line 154) — yes
- `FargateNetworkOutHigh` (line 183) — yes
- `S3PutRateHigh` (line 230) — yes
- `CwLogsIngestHigh` (line 289) — yes

So 5 alarms, the comment is correct. But the comment also lists "RDS-network-out-high never reaches this Lambda" — true today, but only because of an explicit absence. A future contributor reading just the handler would not know which alarms feed it.

**Fix:** Replace prose comment with an explicit allowlist constant (see WR-04). The comment then derives from the data, not the other way around.

---

### IN-03: Magic numbers in retry / timeout config not justified

**File:** `infra/cdk/lib/security-stack.ts:72-73`
**Issue:** `timeout: Duration.seconds(30)`, `memorySize: 256`. The handler does at most 2 API calls (DescribeServices, UpdateService) and a few `console.log`s. 30s is generous, 256 MB is overkill for what could easily run in 128 MB. Not a bug, but raises eyebrows on a security-critical Lambda — over-provisioning increases cold-start cost and could mask a regression where the function starts doing more.

**Fix:** Drop to `Duration.seconds(15)` and `memorySize: 128`. If a future change needs more, it'll fail loudly.

---

### IN-04: `console.log(JSON.stringify(...))` is fine but unstructured

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:34-36`
**Issue:** Lambda's powertools / `aws-lambda-powertools` Logger emits structured JSON with correlation ID, function name, request ID automatically. The hand-rolled `log()` here loses the AWS request ID, which makes incident response harder — you cannot pivot from a CloudWatch alarm to the exact Lambda invocation log.

This is a minor preference; the current approach is fine for a single-handler Lambda. But the pattern doesn't scale to RdsRestartWatcher (which has the same hand-rolled logging, presumably). At some point a shared `logger.mjs` is worth it.

**Fix:** Either accept the duplication, or extract to `infra/cdk/lib/lambda/_lib/logger.mjs` once the second handler proves the pattern. Not a blocker.

---

### IN-05: Sensitive data in logs — no obvious leak, but `failures` could include detail

**File:** `infra/cdk/lib/lambda/killswitch/index.mjs:34-36`
**Issue:** Reviewed all `log()` call sites: `CLUSTER_NAME`, `SERVICE_NAME`, `alarmName`, `newState`, `messageId`, `reason`. None of these are sensitive — cluster and service names are infrastructure identifiers, not credentials. No PII, no IAM ARNs, no account IDs. The current code is clean.

If WR-05's `failures` field gets logged, the contents are AWS-internal error reasons (e.g. "MISSING"), still not sensitive. CloudWatch Logs are encrypted at rest, log group retention is 30 days (security-stack.ts line 64) which is reasonable.

**Fix:** None required. Noted for completeness.

---

_Reviewed: 2026-05-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
