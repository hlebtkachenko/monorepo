# infra/observability

Sidecar configs ready to wire, **currently unwired in CDK**.

Today the deployed log/trace pipeline is CloudWatch via the `awslogs` driver
defined in `infra/cdk/lib/app-stack.ts` plus Sentry SDK init in `apps/api`
and `apps/web`. That is the entire MVP observability surface. See
[`.context/decision-observability-mvp.md`](../../.context/decision-observability-mvp.md)
for the reasoning (CloudWatch + Sentry is Option 2; sidecars are deferred).

## What is in this directory

| File | Role | Wired? |
|------|------|--------|
| `otel-collector.yaml` | OTel Collector Contrib config: OTLP receivers, AWS resource detection, PII scrub, Honeycomb exporter. | No |
| `firelens-fluentbit.conf` | Fluent Bit pipeline: CloudWatch always-on + OTel forward conditional. | No |
| `parsers.conf` | `pino_json` parser for NestJS Logger stdout + generic JSON fallback. | No |

These mirror the pattern documented in `.context/research-lac-infra.md` (B.5
verdict: ADOPT, defer wiring). The files are kept in lockstep with how the app
emits logs (pino-formatted JSON) so the day we wire them, no app-side changes
are required.

## When to wire (trip-wires)

ADR-0002 chose Honeycomb but accepted CloudWatch as the stop-gap. The
explicit trip-wires for enabling this directory are documented in
[ADR-0002 §References](../../docs/adr/0002-observability-honeycomb.md) and
expanded in `.context/decision-observability-mvp.md` "Trip-wire to add OTel
Collector sidecar":

- First paying customer complains about specific slowness you cannot
  reproduce from CloudWatch logs.
- Monthly API requests exceed 10k/day (traffic where sampling matters).
- A/B testing features that need per-cohort latency breakdown.
- Load testing for a real customer before onboarding.

Any one trips the wire. Until then, this directory is dormant.

## Wire-up steps (for reference, do not execute today)

1. **Provision the Honeycomb account** and create an ingest API key in the
   Honeycomb UI. Store as `HONEYCOMB_API_KEY` and `HONEYCOMB_DATASET` in
   AWS Secrets Manager under `/monorepo/{env}/observability/honeycomb`.

2. **Bump task memory** in `infra/cdk/lib/app-stack.ts` from 2 GB to 3 GB.
   Cost delta: +$3.68/mo per environment in eu-central-1 (per
   `.context/decision-observability-mvp.md`). The OTel Collector container
   reserves 256 MB; Fluent Bit reserves 128 MB.

3. **Add the `log_router` container** (Fluent Bit image
   `public.ecr.aws/aws-observability/aws-for-fluent-bit:stable`) using the
   `FireLens` ECS log driver type. Mount this directory into the container
   via `s3ConfigPath` or bake the configs into a custom image.

4. **Add the `otel-collector` container** (image
   `otel/opentelemetry-collector-contrib:<pinned-version>`) with
   `otel-collector.yaml` as its config. Inject `HONEYCOMB_API_KEY` and
   `HONEYCOMB_DATASET` from Secrets Manager as ECS task environment
   variables. Expose ports 4317 (gRPC) + 4318 (HTTP) on `127.0.0.1` only —
   no service discovery, no security group changes.

5. **Switch existing app containers** (`web`, `api`) from
   `LogDriver.awsLogs` to FireLens routing. CloudWatch baseline still
   captured because the FireLens config above writes to CloudWatch in Sink 1
   regardless of OTel collector health.

6. **Audit span attributes for PII** before flipping
   `cdk deploy`. The collector's `attributes/scrub` processor strips the
   well-known offenders (Authorization header, Cookie, x-api-key, DB
   parameter values), but anything custom added via OTel SDK manual
   instrumentation needs review.

7. **Roll forward** with `cdk deploy App-{env}`. CloudWatch remains the
   fallback the entire time; if Honeycomb ingestion fails, logs stay in
   CloudWatch.

## Why CloudWatch stays always-on

ECS task lifecycle, circuit breaker decisions, and stopped-task reason
codes are written through the `awslogs` driver. Routing those events
through FireLens introduces a failure mode where ECS infra logs can be lost
during a Fluent Bit crash. CloudWatch remains the contract surface for ECS
itself even after Honeycomb is wired — both sinks coexist.

## Sentry stays separate

Sentry is initialised in-process by the application SDKs
(`apps/api/src/main.ts`, `apps/web/next.config.mjs`). No sidecar, no log
routing. Sentry receives `Error` instances + stack traces; Honeycomb (when
wired) receives spans + structured logs. The two-pane glass model is
explicit in ADR-0002 and accepted at MVP scale.

## Cross-references

- [ADR-0002: Observability Honeycomb](../../docs/adr/0002-observability-honeycomb.md)
- [ADR-0007: MVP single-account CDK only](../../docs/adr/0007-mvp-single-account-cdk-only.md)
- [`.context/decision-observability-mvp.md`](../../.context/decision-observability-mvp.md)
- [`.context/infra-review-synthesis.md`](../../.context/infra-review-synthesis.md) E.3
- [`infra/cdk/lib/app-stack.ts`](../cdk/lib/app-stack.ts) — current awslogs
  driver wiring
- [`infra/cdk/lib/observability-stack.ts`](../cdk/lib/observability-stack.ts)
  — alarm + SNS topic plumbing (separate concern from this directory)
