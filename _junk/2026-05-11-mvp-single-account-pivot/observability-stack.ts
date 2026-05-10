import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import type { AppStack } from "./app-stack";

export interface ObservabilityStackProps extends StackProps {
  readonly app: AppStack;
}

/**
 * ObservabilityStack: CloudWatch Log Groups + Metric Filters, Honeycomb integration
 * via OpenTelemetry sidecar (per ADR 0002), CloudWatch Alarms, EventBridge rules
 * forwarding incidents to PagerDuty.
 *
 * Not yet implemented. See docs/runbooks/AWS-BOOTSTRAP.md and
 * docs/plans/AWS-INTEGRATION-PLAN.md (Observability section).
 */
export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    throw new Error(
      "ObservabilityStack: not yet implemented — see AWS-BOOTSTRAP runbook and AWS-INTEGRATION-PLAN.md (Observability).",
    );
  }
}
