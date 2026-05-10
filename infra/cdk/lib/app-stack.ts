import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import type { NetworkStack } from "./network-stack";
import type { DataStack } from "./data-stack";

export interface AppStackProps extends StackProps {
  readonly network: NetworkStack;
  readonly data: DataStack;
}

/**
 * AppStack: ECS Fargate (Graviton), ALB, WAFv2, target groups, autoscaling,
 * task role with least-privilege Secrets Manager + S3 access, container insights.
 *
 * Not yet implemented. See docs/runbooks/AWS-BOOTSTRAP.md and
 * docs/plans/AWS-INTEGRATION-PLAN.md (Application section).
 */
export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    throw new Error(
      "AppStack: not yet implemented — see AWS-BOOTSTRAP runbook and AWS-INTEGRATION-PLAN.md (Application).",
    );
  }
}
