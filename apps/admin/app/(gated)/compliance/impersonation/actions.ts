"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { and, eq, isNull, sql } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { impersonation } from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { requireAdminCapability } from "@/lib/admin-capability"

const Input = z.object({ id: z.string().uuid() })

export interface ForceEndResult {
  ok: boolean
  error?: string
}

export async function forceEndImpersonation(input: {
  id: string
}): Promise<ForceEndResult> {
  await requireAdminCapability("admin:impersonate")
  try {
    const parsed = Input.parse(input)
    const updated = await withAdminBypass(async (tx) => {
      const rows = await tx
        .update(impersonation)
        .set({ ended_at: sql`now()` })
        .where(
          and(eq(impersonation.id, parsed.id), isNull(impersonation.ended_at)),
        )
        .returning({ id: impersonation.id })
      return rows
    })
    if (updated.length === 0) {
      return { ok: false, error: "Already ended or not found" }
    }
    await auditAdminAction({
      action: "admin.compliance.impersonation_force_ended",
      payload: { impersonation_id: parsed.id },
    })
    revalidatePath("/compliance/impersonation")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
