import "server-only"

import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
  Upload,
  getSignedUrl,
} from "@workspace/storage"

/**
 * Avatar storage helpers. Production uses the private `APP_BUCKET` S3 bucket
 * (BlockPublicAccess.BLOCK_ALL, see infra/cdk/lib/data-stack.ts). Development
 * without a configured bucket uses authenticated files under `.next`.
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
const LOCAL_KEY_PREFIX = "local-avatars/"
const LOCAL_STORAGE_ROOT = resolve(
  join(process.cwd(), ".next", "avatar-storage"),
)

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

function localStorageEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.APP_BUCKET
}

function localObjectPath(key: string): string {
  if (!key.startsWith(LOCAL_KEY_PREFIX)) {
    throw new Error("Invalid local avatar key")
  }
  const path = resolve(LOCAL_STORAGE_ROOT, key.slice(LOCAL_KEY_PREFIX.length))
  if (!path.startsWith(`${LOCAL_STORAGE_ROOT}${sep}`)) {
    throw new Error("Invalid local avatar key")
  }
  return path
}

/**
 * Upload an avatar image for `userId` and return its storage key. The timestamp
 * makes the key unique per upload so a re-upload never serves a stale object.
 */
export async function uploadAvatar(args: {
  userId: string
  body: Buffer
  contentType: string
}): Promise<string> {
  const ext = args.contentType === "image/png" ? "png" : "jpg"
  const objectName = `${args.userId}/${Date.now()}.${ext}`
  if (localStorageEnabled()) {
    const key = `${LOCAL_KEY_PREFIX}${objectName}`
    const path = localObjectPath(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, args.body)
    return key
  }

  const key = `avatars/${objectName}`
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
  if (key.startsWith(LOCAL_KEY_PREFIX)) {
    if (!localStorageEnabled()) {
      throw new Error("Local avatar storage is unavailable")
    }
    return `/api/upload/avatar?key=${encodeURIComponent(key)}`
  }
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key })
  return getSignedUrl(getClient(), command, {
    expiresIn: READ_URL_TTL_SECONDS,
  })
}

/**
 * Delete an avatar by storage key. No-ops silently if a local key is absent.
 * Also used by the DELETE route when the user requests removal.
 */
export async function deleteAvatar(key: string): Promise<void> {
  if (key.startsWith(LOCAL_KEY_PREFIX)) {
    if (!localStorageEnabled()) {
      throw new Error("Local avatar storage is unavailable")
    }
    await rm(localObjectPath(key), { force: true })
    return
  }
  const command = new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  await getClient().send(command)
}

export async function readLocalAvatar(key: string): Promise<{
  body: Buffer
  contentType: "image/png" | "image/jpeg"
} | null> {
  if (!localStorageEnabled() || !key.startsWith(LOCAL_KEY_PREFIX)) return null
  try {
    return {
      body: await readFile(localObjectPath(key)),
      contentType: key.endsWith(".png") ? "image/png" : "image/jpeg",
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT") return null
    throw error
  }
}
