import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import type { NetworkStack } from "./network-stack";

export interface DataStackProps extends StackProps {
  readonly network: NetworkStack;
}

/**
 * DataStack: RDS Postgres Multi-AZ, KMS CMK, Secrets Manager runtime creds,
 * automated snapshots replicated to DR region, Performance Insights enabled.
 *
 * Not yet implemented. See docs/runbooks/AWS-BOOTSTRAP.md and
 * docs/plans/AWS-INTEGRATION-PLAN.md (Data section).
 */
export class DataStack extends Stack {
  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    throw new Error(
      "DataStack: not yet implemented — see AWS-BOOTSTRAP runbook and AWS-INTEGRATION-PLAN.md (Data).",
    );
  }
}
