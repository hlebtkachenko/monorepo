import { NextResponse } from "next/server"
import { readDevOutbox } from "@workspace/email"

/**
 * Dev-only mailbox preview. Returns the in-memory list of emails the
 * console transport "sent" since the dev server started. Useful for
 * grabbing the password-reset / invite link without scraping stdout.
 *
 * Gated on `NODE_ENV !== 'production'` to avoid leaking message bodies
 * in deployed environments.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 })
  }
  return NextResponse.json({ messages: readDevOutbox() })
}
