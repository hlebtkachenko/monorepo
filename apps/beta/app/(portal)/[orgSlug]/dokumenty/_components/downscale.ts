"use client"

/**
 * Client-side downscaling, before a byte leaves the phone (spec §2.2:
 * "client-side downscale (canvas, long edge 2400 px, JPEG q0.8 — construction
 * site on 3G)"; §0.4 fix F12).
 *
 * WHY IT IS WORTH DOING AT ALL. A 2026 phone photographs a 4032 × 3024 frame at
 * 3-5 MB. On the site 3G that spec §2.2 names by hand, that is thirty seconds of
 * upload per účtenka, and a client photographing a day's paperwork gives up
 * before the queue drains. Re-encoded at a 2400 px long edge and q0.8 the same
 * photo is 400-700 KB and every digit on the invoice is still legible.
 *
 * THIS IS UX, NOT VALIDATION, AND THE DISTINCTION IS LOAD-BEARING. Everything
 * below runs in a browser the client controls, so nothing it decides is trusted
 * by anything: the server still sniffs the leading bytes of whatever arrives
 * (`lib/storage/content-type.ts`), still counts them against the 25 MiB cap
 * while streaming (`lib/storage/upload-stream.ts`), and still hashes them for
 * the duplicate rule. A client that skips this module, or patches it to send a
 * 500 MB file, meets exactly the same wall. What this buys is a faster upload
 * for the honest case, and that is all it is allowed to buy.
 *
 * WHAT IS NEVER TOUCHED:
 *   PDF   already compressed, and re-encoding one through a canvas is not a
 *         thing a canvas can do.
 *   HEIC  no browser outside Safari can decode it, so `createImageBitmap`
 *         cannot open it. It travels as-is and the SERVER makes the JPEG
 *         derivative (`lib/storage/heic-preview.ts`).
 *   small images
 *         an image already inside the 2400 px box is left exactly as it is,
 *         bytes unchanged. Re-encoding it would cost quality for nothing.
 */

/** Long edge of a downscaled photo, in pixels (spec §2.2). */
export const DOWNSCALE_MAX_EDGE = 2400

/** JPEG quality of a downscaled photo (spec §2.2 `q0.8`). */
export const DOWNSCALE_QUALITY = 0.8

/** The only two types a canvas is asked to open. */
const DOWNSCALABLE = new Set(["image/jpeg", "image/png"])

export type DownscalePlan =
  | {
      downscale: false
      /** Why not — surfaced in tests, never in the UI. */
      reason: "not-an-image" | "already-small"
    }
  | {
      downscale: true
      width: number
      height: number
      quality: number
      contentType: "image/jpeg"
    }

/**
 * What should happen to an image of this type and these dimensions.
 *
 * PURE, and separated from the canvas work for exactly that reason: the rule
 * (which types, which threshold, which target, which quality) is the part worth
 * asserting, and a rule that can only be exercised through a `<canvas>` is a
 * rule nobody exercises.
 *
 * `contentType` is the browser's claim about the picked file. Trusting it here
 * is safe in a way trusting it on the server would not be: the worst a wrong
 * claim can do is skip a downscale, and the server re-sniffs regardless.
 *
 * NOTE THAT A PNG OVER THE THRESHOLD COMES BACK AS A JPEG. That is spec §2.2
 * read literally — one target format, one quality. A photograph saved as PNG is
 * a photograph, and the ones that reach this product are camera-roll pictures of
 * paper, not line art.
 */
export function planDownscale(image: {
  contentType: string
  width: number
  height: number
}): DownscalePlan {
  if (!DOWNSCALABLE.has(image.contentType)) {
    return { downscale: false, reason: "not-an-image" }
  }

  const longest = Math.max(image.width, image.height)
  if (!Number.isFinite(longest) || longest <= DOWNSCALE_MAX_EDGE) {
    return { downscale: false, reason: "already-small" }
  }

  const scale = DOWNSCALE_MAX_EDGE / longest
  return {
    downscale: true,
    // `max(1, …)` so a panorama 8000 × 1 does not round to a zero-height canvas,
    // which throws rather than producing an image.
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
    quality: DOWNSCALE_QUALITY,
    contentType: "image/jpeg",
  }
}

/**
 * `foto.png` → `foto.jpg`, for a file whose bytes we just re-encoded.
 *
 * The server stores the extension it SNIFFS, so this changes nothing about
 * storage — it changes what the client sees in the Dokumenty table, where
 * `original_filename` is displayed verbatim. A row named `.png` whose preview is
 * a JPEG is a small lie, and it is ours rather than the uploader's.
 *
 * Deliberately a local four-line function rather than an import from
 * `lib/storage/content-disposition.ts`: that module is server-side and reaches
 * for `Buffer`, and dragging it into the browser bundle to reuse one string
 * operation would be the expensive kind of DRY.
 */
export function jpegFilename(original: string): string {
  const dot = original.lastIndexOf(".")
  return dot > 0 ? `${original.slice(0, dot)}.jpg` : `${original}.jpg`
}

/** What the queue uploads: possibly the original file, possibly a re-encode. */
export type UploadPayload = {
  blob: Blob
  filename: string
  /** True when the bytes differ from the picked file's. */
  downscaled: boolean
}

/**
 * The file as it should be uploaded.
 *
 * NEVER REJECTS AND NEVER RETURNS NOTHING. Every failure — a browser without
 * `createImageBitmap`, a decoder that refuses the file, a canvas that is tainted
 * or out of memory, a `toBlob` that produces nothing — falls back to the
 * ORIGINAL file. The client came here to send a document; a broken optimisation
 * must not be the reason they cannot.
 */
export async function prepareUpload(file: File): Promise<UploadPayload> {
  const original: UploadPayload = {
    blob: file,
    filename: file.name,
    downscaled: false,
  }

  if (!DOWNSCALABLE.has(file.type)) return original
  if (typeof createImageBitmap !== "function") return original

  let bitmap: ImageBitmap | undefined
  try {
    // `imageOrientation: "from-image"` applies the EXIF rotation tag while
    // decoding. It has to be asked for: a canvas re-encode DROPS EXIF, so
    // without this a portrait phone photo would be stored permanently sideways
    // — the tag that used to say "rotate me" no longer exists in the output.
    // Browsers that do not know the option ignore it rather than throwing.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })

    const plan = planDownscale({
      contentType: file.type,
      width: bitmap.width,
      height: bitmap.height,
    })
    if (!plan.downscale) return original

    const canvas = document.createElement("canvas")
    canvas.width = plan.width
    canvas.height = plan.height
    const context = canvas.getContext("2d")
    if (!context) return original
    context.drawImage(bitmap, 0, 0, plan.width, plan.height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, plan.contentType, plan.quality)
    })

    // A re-encode that is not smaller has bought nothing and lost a generation
    // of quality. Flat or already-compressed sources can land here.
    if (!blob || blob.size >= file.size) return original

    return {
      blob,
      filename: jpegFilename(file.name),
      downscaled: true,
    }
  } catch {
    return original
  } finally {
    bitmap?.close()
  }
}
