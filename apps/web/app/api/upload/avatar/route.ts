import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"

import { deleteAvatar, uploadAvatar } from "../../../_lib/avatar-storage"

/**
 * Avatar upload — authenticated POST, `multipart/form-data` with a single
 * `file` field. The target user is ALWAYS the session user; no user/org id is
 * read from the request. Stores the image in the private APP_BUCKET and
 * persists the resulting S3 object key to `app_user.avatar_url`.
 *
 * The client (onboarding/profile/profile-form.tsx) already resizes and crops
 * the image before upload, so this route does no image processing.
 */
export const dynamic = "force-dynamic"

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
// Pre-parse cap: the 2 MB file + multipart framing overhead. request.formData()
// buffers the whole body in memory, so oversized bodies must be rejected from
// the Content-Length header BEFORE parsing; the post-parse file.size check
// stays the authoritative gate.
const MAX_CONTENT_LENGTH = 3 * 1024 * 1024 // 3 MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"])

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
    console.error("[upload/avatar] S3 upload failed", err)
    return NextResponse.json({ error: "upload failed" }, { status: 500 })
  }

  try {
    await withAdminBypass(async (db) => {
      await db
        .update(app_user)
        .set({ avatar_url: key, updated_at: new Date() })
        .where(eq(app_user.id, userId))
    })
  } catch (err) {
    console.error("[upload/avatar] persist avatar_url failed", err)
    return NextResponse.json({ error: "persist failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * Avatar removal — authenticated DELETE. Clears the S3 object and nulls
 * `app_user.avatar_url`. Used by profile-form when the user clicks
 * "Remove photo" and already has a saved avatar on the server.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  let currentKey: string | null = null
  try {
    await withAdminBypass(async (db) => {
      const [row] = await db
        .select({ avatar_url: app_user.avatar_url })
        .from(app_user)
        .where(eq(app_user.id, userId))
        .limit(1)
      currentKey = row?.avatar_url ?? null
    })
  } catch (err) {
    console.error("[upload/avatar] fetch avatar_url failed", err)
    return NextResponse.json({ error: "fetch failed" }, { status: 500 })
  }

  if (currentKey) {
    try {
      await deleteAvatar(currentKey)
    } catch (err) {
      console.error("[upload/avatar] S3 delete failed", err)
      return NextResponse.json({ error: "delete failed" }, { status: 500 })
    }
  }

  try {
    await withAdminBypass(async (db) => {
      await db
        .update(app_user)
        .set({ avatar_url: null, updated_at: new Date() })
        .where(eq(app_user.id, userId))
    })
  } catch (err) {
    console.error("[upload/avatar] clear avatar_url failed", err)
    return NextResponse.json({ error: "persist failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
