#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DataStack } from "../lib/data-stack";
import { AppStack } from "../lib/app-stack";
import { ObservabilityStack } from "../lib/observability-stack";

const app = new App();

const env = (app.node.tryGetContext("env") as string | undefined) ?? "staging";
const environments = app.node.tryGetContext("environments") as
  | Record<string, { account: string; region: string }>
  | undefined;

const target = environments?.[env];
if (!target) {
  throw new Error(`Unknown env "${env}". Add it to cdk.json under context.environments.`);
}

if (target.account.startsWith("<TBD")) {
  // Synth-only mode: account is a placeholder until docs/runbooks/AWS-BOOTSTRAP.md is complete.
  console.warn(
    `[cdk] env=${env} account is "${target.account}" — synth only, no deploy until AWS_BOOTSTRAPPED=true.`,
  );
}

const stackEnv = { account: target.account, region: target.region };

const network = new NetworkStack(app, `Network-${env}`, { env: stackEnv });
const data = new DataStack(app, `Data-${env}`, { env: stackEnv, network });
const application = new AppStack(app, `App-${env}`, { env: stackEnv, network, data });
new ObservabilityStack(app, `Observability-${env}`, { env: stackEnv, app: application });

Tags.of(app).add("Environment", env);
Tags.of(app).add("Repo", "hlebtkachenko/monorepo");
Tags.of(app).add("ManagedBy", "AWS-CDK");
