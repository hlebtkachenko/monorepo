import { describe, expect, it } from "vitest"

import {
  deleteAvatar,
  presignAvatarRead,
  readLocalAvatar,
  uploadAvatar,
} from "./avatar-storage"

describe("local avatar storage", () => {
  it("uploads, serves, and deletes avatars without APP_BUCKET outside production", async () => {
    const previousBucket = process.env.APP_BUCKET
    let key: string | undefined
    delete process.env.APP_BUCKET
    try {
      const body = Buffer.from("test-avatar")
      key = await uploadAvatar({
        userId: `test-${crypto.randomUUID()}`,
        body,
        contentType: "image/png",
      })

      expect(key).toMatch(/^local-avatars\/test-.+\/\d+\.png$/)
      expect(await presignAvatarRead(key)).toBe(
        `/api/upload/avatar?key=${encodeURIComponent(key)}`,
      )
      await expect(readLocalAvatar(key)).resolves.toEqual({
        body,
        contentType: "image/png",
      })

      await deleteAvatar(key)
      await expect(readLocalAvatar(key)).resolves.toBeNull()
      key = undefined
    } finally {
      if (key) await deleteAvatar(key)
      if (previousBucket === undefined) delete process.env.APP_BUCKET
      else process.env.APP_BUCKET = previousBucket
    }
  })
})
