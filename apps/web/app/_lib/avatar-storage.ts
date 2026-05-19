import "server-only"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
  Upload,
  getSignedUrl,
} from "@workspace/storage"

/**
 * Avatar storage helpers — uploads to and reads from the private `APP_BUCKET`
 * S3 bucket (BlockPublicAccess.BLOCK_ALL, see infra/cdk/lib/data-stack.ts).
 *
 * `avatar_url` stores the S3 object KEY, not a URL: the bucket is private so a
 * public URL would not resolve, and a presigned URL expires. The key is the
 * stable identifier; render code calls `presignAvatarRead` to mint a fresh
 * short-lived GET URL on each page load.
 *
 * Tradeoff: presigning on every render adds no network round-trip (the
 * signature is computed locally from credentials) but the resulting URL is
 * not cacheable across renders because it carries an expiry. For an avatar on
 * an onboarding/profile page this is fine. If avatars later need long-lived
 * cacheable URLs, the alternative is a CloudFront distribution with an OAC in
 * front of the bucket — deliberately out of scope here.
 */

const READ_URL_TTL_SECONDS = 60 * 60 // 1 hour

let cachedClient: S3Client | null = null

function getClient(): S3Client {
  if (!cachedClient) {
    // Region from AWS_REGION; credentials resolve via the default provider
    // chain (ECS task role in AWS, shared config locally) — same pattern as
    // packages/email SesTransport.
    cachedClient = new S3Client({ region: process.env.AWS_REGION })
  }
  return cachedClient
}

function getBucket(): string {
  const bucket = process.env.APP_BUCKET
  if (!bucket) {
    throw new Error("APP_BUCKET is not set")
  }
  return bucket
}

/**
 * Upload an avatar image for `userId` and return the stored S3 object key.
 * Key shape: `avatars/{userId}/{timestamp}.{ext}`. The timestamp makes the
 * key unique per upload so a re-upload never serves a stale cached object.
 */
export async function uploadAvatar(args: {
  userId: string
  body: Buffer
  contentType: string
}): Promise<string> {
  const ext = args.contentType === "image/png" ? "png" : "jpg"
  const key = `avatars/${args.userId}/${Date.now()}.${ext}`
  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: getBucket(),
      Key: key,
      Body: args.body,
      ContentType: args.contentType,
    },
  })
  await upload.done()
  return key
}

/**
 * Mint a short-lived presigned GET URL for a stored avatar key. Returns null
 * if the key is empty/missing so callers can fall back to the avatar
 * placeholder without branching on every call site.
 */
export async function presignAvatarRead(
  key: string | null | undefined,
): Promise<string | null> {
  if (!key) return null
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key })
  return getSignedUrl(getClient(), command, {
    expiresIn: READ_URL_TTL_SECONDS,
  })
}

/**
 * Delete an avatar object from S3 by key. No-ops silently if the key is
 * absent (already deleted or was never uploaded). Also used by the DELETE
 * route to remove avatars when the user requests removal.
 */
export async function deleteAvatar(key: string): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  await getClient().send(command)
}
