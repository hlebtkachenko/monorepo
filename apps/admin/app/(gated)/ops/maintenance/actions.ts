"use server"

import { eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { feature_flag } from "@workspace/db/schema"

import { requireAdminCapability } from "@/lib/admin-capability"

const MAINTENANCE_KEY = "maintenance.lockdown"

/**
 * Idempotent-create the `maintenance.lockdown` flag so the page never
 * shows a dead row. Inserts disabled if missing, no-op otherwise.
 * Lockdown logic itself lives in the customer-facing apps.
 */
export async function ensureMaintenanceFlag(): Promise<void> {
  await requireAdminCapability("admin:read")
  await withAdminBypass(async (db) => {
    const existing = await db
      .select({ key: feature_flag.key })
      .from(feature_flag)
      .where(eq(feature_flag.key, MAINTENANCE_KEY))
      .limit(1)
    if (existing.length === 0) {
      await db.insert(feature_flag).values({
        key: MAINTENANCE_KEY,
        enabled: false,
        description:
          "Global maintenance lockdown. ON = customer-facing banner + write 503.",
        payload: {},
      })
    }
  })
}
