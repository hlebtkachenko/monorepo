# CDK App Stacks

Application-layer infrastructure. Four stacks, deployed per environment, named `Network-<env>`, `Data-<env>`, `App-<env>`, `Observability-<env>`.

## Stack layout

| Stack | Responsibilities |
|-------|------------------|
| `NetworkStack` | VPC, subnets, NAT, PrivateLink endpoints, security groups |
| `DataStack` | RDS Postgres Multi-AZ, KMS CMK, Secrets Manager runtime creds |
| `AppStack` | ECS Fargate (Graviton), ALB, WAFv2, autoscaling, IAM task role |
| `ObservabilityStack` | CloudWatch + Honeycomb (OTel) + alarms + EventBridge -> PagerDuty |

All stacks throw `Error('… not yet implemented')` until `docs/runbooks/AWS-BOOTSTRAP.md` is complete. `cdk synth` exercises type-checking and stack instantiation pre-bootstrap.

## Cross-stack references

We do **not** use CloudFormation Exports. Exports pin producer stacks and prevent renames or replacements. Instead:

1. Producer stack writes a `StringParameter` under `/platform/<env>/<resource>`.
2. Consumer stack reads via `StringParameter.valueFromLookup(this, '/platform/<env>/<resource>')`.

Same convention for outputs from OpenTofu (Tofu writes the parameter, CDK reads).

```ts
// In NetworkStack (producer)
new StringParameter(this, "VpcIdParam", {
  parameterName: `/platform/${env}/vpc/id`,
  stringValue: this.vpc.vpcId,
});

// In AppStack (consumer)
const vpcId = StringParameter.valueFromLookup(this, `/platform/${env}/vpc/id`);
```

## Bootstrap order

Per environment (staging, production):

1. Run `docs/runbooks/AWS-BOOTSTRAP.md` steps 1 through 8.
2. `make bootstrap-cdk ACCOUNT=<account-id> REGION=eu-central-1` — creates the CDK toolkit stack.
3. `make synth-cdk` — produces `cdk.out/`, no AWS API calls.
4. `make diff-cdk` — first run shows the entire stack as a create.
5. `make deploy-cdk ENV=staging` — deploy via OIDC role from CI; do not deploy from a workstation outside dev.

## Drift detection

`cdk drift --all` runs nightly via `.github/workflows/_deploy-aws.yml` (scheduled) once the env is bootstrapped. Drift report posts to a GitHub issue.

## Local synth without AWS

```bash
pnpm install
pnpm --filter @workspace/cdk synth
```

`bin/app.ts` warns when the configured account is `<TBD>` but proceeds with synth so type-checking and unit tests run pre-bootstrap.
