/**
 * HEIC → JPEG, once, at upload (spec §2.2: "HEIC: server generates JPEG preview
 * derivative on upload"; §0.4 fix F22).
 *
 * THE PROBLEM THIS SOLVES. An iPhone photographs in HEIC by default, and a
 * client photographing an účtenka on a stavba is beta's most common upload. HEIC
 * is also the one type on the allowlist that no non-Apple browser renders, so
 * before this module the row sheet could only tell that client to download their
 * own photo to look at it. The original is still stored and downloaded verbatim
 * — this produces a SECOND, smaller object whose only job is to be renderable.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT `sharp`, WHICH THE MONOREPO ALREADY RESOLVES
 * ---------------------------------------------------------------------------
 *
 * Two independent reasons, both measured rather than assumed:
 *
 *   1. sharp's prebuilt libvips CANNOT DECODE HEIC. `sharp@0.34.5` /
 *      `libvips 8.17.3` registers a `heif` loader whose `fileSuffix` is
 *      `['.avif']`: libheif is compiled with the AV1 codec only, not HEVC, for
 *      patent-licensing reasons. Feeding it a real iPhone-style HEIC (produced
 *      with `sips -s format heic`) answers
 *      `heif: Error while loading plugin: Support for this compression format
 *      has not been built in`, while the same build round-trips an AVIF
 *      perfectly. So the decode half is simply not available.
 *
 *   2. Even if it were, sharp is a NATIVE module and `apps/beta/Dockerfile`
 *      installs on `$BUILDPLATFORM` and runs on `$TARGETPLATFORM`
 *      (`deploy-beta.yml` builds `linux/arm64` on an amd64 runner). The
 *      optionalDependency resolved at install time would be the x64 binary and
 *      the arm64 runner would fail to load it. Making sharp work would mean
 *      running the whole install+build under emulation.
 *
 * `heic-decode` (a thin wrapper over `libheif-js`, the emscripten build of
 * libheif) has neither problem: it is WebAssembly, so it decodes HEVC and it is
 * the same artefact on every architecture. `jpeg-js` encodes, in JavaScript, for
 * the same portability reason. Both are pinned EXACTLY rather than by range —
 * they are the two pieces of this application that parse attacker-supplied bytes
 * for pixels, and "whatever minor version resolved today" is not a property
 * worth having there.
 *
 * Licence note, recorded so nobody has to re-derive it: `heic-decode` is ISC,
 * `jpeg-js` BSD-3-Clause, `libheif-js` LGPL-3.0. The LGPL library is used
 * unmodified and server-side; beta is a hosted service and the image is not
 * distributed to users, so no copyleft obligation is triggered.
 *
 * ---------------------------------------------------------------------------
 * FAILURE IS A NORMAL OUTCOME
 * ---------------------------------------------------------------------------
 *
 * Every entry point here answers `null` rather than throwing. A derivative is a
 * convenience: a corrupt file, an exotic codec, a frame larger than the pixel
 * ceiling below, or a decoder that simply says no must all end with the upload
 * SUCCEEDING and the row carrying no preview. The row sheet then renders the
 * same "stáhněte si ho" sentence it rendered before this module existed. An
 * upload that fails because a thumbnail failed would be the worse product.
 */
import "server-only"

import decodeHeic from "heic-decode"
import { encode as encodeJpeg } from "jpeg-js"

import { resizeRgba } from "./rgba-resize"

/**
 * Long edge of the derivative, in pixels.
 *
 * The same 2400 the client-side downscale uses (spec §2.2), and for the same
 * reason: it is the size at which a photographed A4 invoice is still readable.
 * Stated as its own constant rather than imported from the client helper —
 * these are two different pipelines that happen to agree, and coupling them
 * would mean a change to the browser's behaviour silently changed the server's.
 */
export const HEIC_PREVIEW_MAX_EDGE = 2400

/**
 * JPEG quality of the derivative, 0-100.
 *
 * 80 is spec §2.2's `q0.8` on `jpeg-js`'s scale.
 */
export const HEIC_PREVIEW_QUALITY = 80

/**
 * Pixel ceiling for a frame this module will decode.
 *
 * NOT A SIZE LIMIT — the 25 MiB cap already bounds the compressed bytes. This
 * bounds the DECOMPRESSED frame, which is the number that actually costs memory:
 * decoding is 4 bytes per pixel, so 80 MP would be a 320 MiB allocation on a
 * task sized at 512-1024 MiB (plan Part 1). 50 MP is comfortably past every
 * phone and mirrorless camera in service (a 48 MP iPhone frame is 12 MP unless
 * ProRAW is on) and an order of magnitude below the point where one upload can
 * take the task down. A frame beyond it gets no derivative, which is exactly
 * what a frame the decoder refused gets.
 */
export const HEIC_PREVIEW_MAX_PIXELS = 50_000_000

export type HeicPreview = {
  /** JPEG bytes, ready to store. */
  bytes: Buffer
  width: number
  height: number
}

/**
 * Decode a HEIC, downscale it, and encode a JPEG.
 *
 * `null` for anything that does not work out — see the module header. The caller
 * never has to decide whether a failure is fatal, because none of them is.
 */
export async function heicJpegPreview(
  heic: Uint8Array,
): Promise<HeicPreview | null> {
  try {
    const frame = await decodeHeic({ buffer: heic })

    if (
      !Number.isInteger(frame.width) ||
      !Number.isInteger(frame.height) ||
      frame.width < 1 ||
      frame.height < 1
    ) {
      return null
    }
    if (frame.width * frame.height > HEIC_PREVIEW_MAX_PIXELS) return null
    // A decoder that reported dimensions it did not fill would make the resize
    // read past the end of the buffer. Cheap to check, and the check is against
    // the only two numbers the caller did not supply.
    if (frame.data.length < frame.width * frame.height * 4) return null

    const scaled = resizeRgba(
      { data: frame.data, width: frame.width, height: frame.height },
      HEIC_PREVIEW_MAX_EDGE,
    )

    const encoded = encodeJpeg(
      {
        // `jpeg-js` wants a `Buffer`-alike; a `Uint8ClampedArray` view is
        // accepted by value, and wrapping rather than copying keeps the peak
        // allocation at one frame.
        data: Buffer.from(
          scaled.data.buffer,
          scaled.data.byteOffset,
          scaled.data.length,
        ),
        width: scaled.width,
        height: scaled.height,
      },
      HEIC_PREVIEW_QUALITY,
    )

    return {
      bytes: Buffer.from(encoded.data),
      width: scaled.width,
      height: scaled.height,
    }
  } catch {
    // Deliberately swallowed, deliberately not logged with the bytes: this runs
    // on client-supplied input, and the interesting failures (an unsupported
    // codec, a truncated file) are indistinguishable from the boring ones from
    // here. The observable consequence — a row with no preview — is the signal.
    return null
  }
}
