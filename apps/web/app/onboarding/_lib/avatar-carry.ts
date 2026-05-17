/**
 * Client-side carry for the onboarding avatar.
 *
 * During fresh onboarding the Better Auth account does not exist until the
 * password step, so the avatar upload route (authenticated) cannot be hit at
 * the profile step. The cropped image is parked in `sessionStorage` as a
 * base64 data URL and uploaded once the account + session exist.
 *
 * sessionStorage (not localStorage) so the carry is scoped to the tab and
 * cleared when onboarding is abandoned by closing the tab.
 */

const AVATAR_CARRY_KEY = "onboarding:avatar"

/** Hard ceiling on the encoded data URL. A cropped, resized PNG is well under
 * this; anything larger is unexpected and skipped rather than risking a
 * sessionStorage quota exception. */
const MAX_ENCODED_BYTES = 4 * 1024 * 1024 // 4 MB

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(blob)
  })
}

/**
 * Park the cropped avatar in sessionStorage. Non-throwing: if encoding or the
 * size guard fails, it logs and returns — the avatar is simply not carried.
 */
export async function storeCarriedAvatar(blob: Blob): Promise<void> {
  if (typeof window === "undefined") return
  try {
    const dataUrl = await readDataUrl(blob)
    if (dataUrl.length > MAX_ENCODED_BYTES) {
      console.warn(
        "[onboarding/avatar] cropped avatar too large to carry, skipping",
        dataUrl.length,
      )
      return
    }
    window.sessionStorage.setItem(AVATAR_CARRY_KEY, dataUrl)
  } catch (err) {
    console.warn("[onboarding/avatar] failed to store carried avatar", err)
  }
}

/** Drop the carried avatar. Safe to call when nothing is stored. */
export function clearCarriedAvatar(): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(AVATAR_CARRY_KEY)
  } catch {
    // sessionStorage unavailable — nothing to clear.
  }
}

/**
 * Read the carried avatar (if any) and POST it to the authenticated upload
 * route, then clear the carry key. Non-fatal by contract: every failure path
 * logs and returns; onboarding must never break because of the avatar.
 */
export async function uploadCarriedAvatar(): Promise<void> {
  if (typeof window === "undefined") return

  let dataUrl: string | null
  try {
    dataUrl = window.sessionStorage.getItem(AVATAR_CARRY_KEY)
  } catch {
    return
  }
  if (!dataUrl) return

  try {
    const blob = await (await fetch(dataUrl)).blob()
    const ext = blob.type === "image/png" ? "png" : "jpg"
    const body = new FormData()
    body.append("file", blob, `avatar.${ext}`)
    const res = await fetch("/api/upload/avatar", { method: "POST", body })
    if (!res.ok) {
      console.warn(
        "[onboarding/avatar] carried avatar upload failed",
        res.status,
      )
    }
  } catch (err) {
    console.warn("[onboarding/avatar] carried avatar upload errored", err)
  } finally {
    // Always clear: a failed upload should not retry on every later step,
    // and a successful one must not be re-uploaded.
    clearCarriedAvatar()
  }
}
