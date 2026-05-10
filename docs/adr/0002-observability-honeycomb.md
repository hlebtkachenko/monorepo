# 2. Observability: Honeycomb for traces and events

- Status: Accepted
- Date: 2026-05-10
- Deciders: Hleb Tkachenko

## Context and Problem Statement

Need a single observability target that handles traces, structured events, and high-cardinality queries. Sentry stays for error monitoring; this ADR is about traces / events / span analytics.

## Decision Drivers

- Traces over metrics: high-cardinality questions ("which user, which feature flag, which cohort") matter more than aggregate counters at this stage.
- OpenTelemetry-native: no proprietary SDKs.
- Cost predictability for solo dev / small team.
- DORA-aligned: auditable retention, SOC 2 capable.

## Considered Options

1. **Honeycomb.** OTel-native, columnar storage, BubbleUp anomaly detection, generous free tier (20M events/month at time of writing), per-event pricing predictable.
2. **Datadog.** Best-in-class UX, deepest integrations, but pricing scales aggressively (per host + per ingest GB + per APM seat). For a fintech projection of $X/month at <100 services, ~3-4x Honeycomb.
3. **AWS-native (CloudWatch + X-Ray).** Already on the bill, but X-Ray's sampling and query model are not built for high-cardinality questions. Use as the IaC stop-gap, not the destination.
4. **Self-hosted (Tempo + Grafana).** Cheapest at scale but Hleb is solo; ops cost dominates.

## Decision Outcome

Chosen: **Option 1, Honeycomb.**

Reasoning:
- OTel-native means the application code is vendor-neutral; only the exporter target changes.
- Per-event pricing is predictable and aligned with traffic, not with infrastructure size.
- BubbleUp catches the "what changed" question that hand-built dashboards miss.
- Datadog rejected on cost.

## Consequences

Positive:
- Single ingest target for traces and structured events.
- Vendor-neutral instrumentation (OTel SDK + OTLP).

Negative:
- Honeycomb is a third party — DPA required, data residency confirmed (US data center; document data-flow for DPA).
- Sentry stays separate for errors; two pane glasses (acceptable trade-off for solo dev).

## Migration Path If Scale Demands

If event volume crosses ~100M/month and Honeycomb cost overtakes Datadog total cost, swap exporter target. OTel instrumentation does not change. Cost crossover is the trigger; replace this ADR rather than fork.

## References

- `infra/cdk/lib/observability-stack.ts` (sidecar collector wiring lands here post-bootstrap)
- `docs/plans/AWS-INTEGRATION-PLAN.md` (Observability section)
