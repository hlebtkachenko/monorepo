import { NextResponse } from "next/server"
import { z } from "zod"

import { writeAuditEventGlobal } from "@workspace/db"

import { requireAdminSession } from "@/lib/admin-session"

const Body = z.object({
  message: z.string().max(4000),
  digest: z.string().max(200).nullable().optional(),
  stack: z.string().max(20_000).nullable().optional(),
  componentStack: z.string().max(20_000).nullable().optional(),
  pathname: z.string().max(2000),
  url: z.string().max(2000),
  userAgent: z.string().max(2000).optional(),
  buildSha: z.string().max(200).optional(),
  occurredAt: z.string().max(50),
  extra: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: Request) {
  let ctx
  try {
    ctx = await requireAdminSession()
  } catch {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    )
  }

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 400 },
    )
  }

  await writeAuditEventGlobal({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "admin.error.reported",
    payload: {
      message: body.message,
      digest: body.digest ?? null,
      stack: body.stack ?? null,
      component_stack: body.componentStack ?? null,
      pathname: body.pathname,
      url: body.url,
      user_agent: body.userAgent ?? null,
      build_sha: body.buildSha ?? null,
      occurred_at: body.occurredAt,
      extra: body.extra ?? {},
    },
  })

  return NextResponse.json({ ok: true })
}
