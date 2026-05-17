# @workspace/storage

Thin re-export layer for the AWS S3 SDK surface needed across the monorepo: object get, presigned URL generation, and multipart upload.

## Entry point

```ts
import {
  S3Client,
  GetObjectCommand,
  getSignedUrl,
  Upload,
} from "@workspace/storage"
```

## What it does

Centralises the three `@aws-sdk` packages used for S3 operations so application packages share a single dependency declaration. Credentials are resolved from the environment via the default AWS credential provider chain (IAM role in ECS, `~/.aws` in dev).

## Usage

```ts
import { S3Client, GetObjectCommand, getSignedUrl } from "@workspace/storage"

const client = new S3Client({ region: process.env.AWS_REGION })

// Presigned download URL (15 minutes)
const url = await getSignedUrl(
  client,
  new GetObjectCommand({ Bucket: "afframe-documents", Key: objectKey }),
  { expiresIn: 900 },
)
```

For multipart uploads use `Upload` from `@workspace/storage` with `client` and a readable stream.
