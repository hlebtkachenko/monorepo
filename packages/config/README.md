# @workspace/config

Thin re-export layer for AWS SDK clients used to fetch runtime configuration from AWS Secrets Manager and SSM Parameter Store.

## Entry point

```ts
import { SecretsManagerClient, GetSecretValueCommand } from "@workspace/config"

import { SSMClient, GetParameterCommand } from "@workspace/config"

import { fromNodeProviderChain } from "@workspace/config"
```

## What it does

Centralises the AWS SDK surface needed for config-fetching so application packages do not declare individual `@aws-sdk/*` devDependencies. Credentials are resolved via `fromNodeProviderChain` (IAM role in ECS, `~/.aws` in dev).

## Usage

```ts
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  fromNodeProviderChain,
} from "@workspace/config"

const client = new SecretsManagerClient({
  region: process.env.AWS_REGION,
  credentials: fromNodeProviderChain(),
})
const { SecretString } = await client.send(
  new GetSecretValueCommand({ SecretId: "afframe/prod/db" }),
)
```
