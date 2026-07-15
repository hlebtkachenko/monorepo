import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user, audit_event } from "@workspace/db/schema"

import {
  deleteAvatar,
  readLocalAvatar,
  uploadAvatar,
} from "../../../_lib/avatar-storage"

/**
 * Avatar upload — authenticated POST, `multipart/form-data` with a single
 * `file` field. The target user is ALWAYS the session user; no user/org id is
 * read from the request. Stores the image in private avatar storage and
 * persists the resulting object key to `app_user.avatar_url`.
 *
 * The Profile avatar editor already resizes and crops the image before upload,
 * so this route does no image processing.
 */
export const dynamic = "force-dynamic"

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
// Pre-parse cap: the 2 MB file + multipart framing overhead. request.formData()
// buffers the whole body in memory, so oversized bodies must be rejected from
// the Content-Length header BEFORE parsing; the post-parse file.size check
// stays the authoritative gate.
const MAX_CONTENT_LENGTH = 3 * 1024 * 1024 // 3 MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"])

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  const key = new URL(request.url).searchParams.get("key")
  if (!key?.startsWith(`local-avatars/${userId}/`)) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  const avatar = await readLocalAvatar(key)
  if (!avatar) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }
  const body = avatar.body.buffer.slice(
    avatar.body.byteOffset,
    avatar.body.byteOffset + avatar.body.byteLength,
  ) as ArrayBuffer
  return new NextResponse(body, {
    headers: {
      "content-type": avatar.contentType,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  })
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  // Absent header (e.g. chunked transfer) falls through to the authoritative
  // post-parse checks below.
  const contentLength = request.headers.get("content-length")
  if (contentLength !== null && Number(contentLength) > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 },
    )
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "unsupported content type" },
      { status: 400 },
    )
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "file size out of range" },
      { status: 400 },
    )
  }

  const body = Buffer.from(await file.arrayBuffer())

  let key: string
  try {
    key = await uploadAvatar({ userId, body, contentType: file.type })
  } catch (err) {
    console.error("[upload/avatar] avatar upload failed", err)
    return NextResponse.json({ error: "upload failed" }, { status: 500 })
  }

  let previousKey: string | null = null
  try {
    await withAdminBypass(async (db) => {
      const [current] = await db
        .select({ avatarUrl: app_user.avatar_url })
        .from(app_user)
        .where(eq(app_user.id, userId))
        .limit(1)
      previousKey = current?.avatarUrl ?? null
      await db
        .update(app_user)
        .set({ avatar_url: key, updated_at: new Date() })
        .where(eq(app_user.id, userId))
      await db.insert(audit_event).values({
        actor_user_id: userId,
        action: "profile.avatar_updated",
        payload: {},
      })
    })
  } catch (err) {
    try {
      await deleteAvatar(key)
    } catch (cleanupError) {
      console.error(
        "[upload/avatar] uploaded object cleanup failed",
        cleanupError,
      )
    }
    console.error("[upload/avatar] persist avatar_url failed", err)
    return NextResponse.json({ error: "persist failed" }, { status: 500 })
  }

  if (previousKey && previousKey !== key) {
    try {
      await deleteAvatar(previousKey)
    } catch (err) {
      console.error("[upload/avatar] previous object cleanup failed", err)
    }
  }

  return NextResponse.json({ ok: true })
}

/**
 * Avatar removal — authenticated DELETE. Clears the stored object and nulls
 * `app_user.avatar_url`. Used by profile-form when the user clicks
 * "Remove photo" and already has a saved avatar on the server.
 */
export async function DELETE(_request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  let currentKey: string | null = null
  let hasFallbackImage = false
  try {
    await withAdminBypass(async (db) => {
      const [row] = await db
        .select({
          avatar_url: app_user.avatar_url,
          image: app_user.image,
        })
        .from(app_user)
        .where(eq(app_user.id, userId))
        .limit(1)
      currentKey = row?.avatar_url ?? null
      hasFallbackImage = Boolean(row?.image)
    })
  } catch (err) {
    console.error("[upload/avatar] fetch avatar_url failed", err)
    return NextResponse.json({ error: "fetch failed" }, { status: 500 })
  }

  if (currentKey) {
    try {
      await deleteAvatar(currentKey)
    } catch (err) {
      console.error("[upload/avatar] avatar delete failed", err)
      return NextResponse.json({ error: "delete failed" }, { status: 500 })
    }
  }

  try {
    await withAdminBypass(async (db) => {
      await db
        .update(app_user)
        .set({ avatar_url: null, image: null, updated_at: new Date() })
        .where(eq(app_user.id, userId))
      if (currentKey || hasFallbackImage) {
        await db.insert(audit_event).values({
          actor_user_id: userId,
          action: "profile.avatar_removed",
          payload: {},
        })
      }
    })
  } catch (err) {
    console.error("[upload/avatar] clear avatar_url failed", err)
    return NextResponse.json({ error: "persist failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
