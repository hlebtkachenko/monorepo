/**
 * A REAL, decodable HEIC — 64 × 48, HEVC-coded, 1.3 KB.
 *
 * WHY THIS EXISTS ALONGSIDE `HEIC_BYTES` IN `memory-document-store.ts`. That one
 * is a hand-built `ftyp` box: exactly enough bytes to prove the magic-byte
 * sniffer says "heic", and nothing behind it. It is the right fixture for the
 * allowlist and the wrong one for the DERIVATIVE, which has to actually decode
 * an image — a test that fed the synthetic header to `heicJpegPreview` would
 * assert `null` and pass forever, including on the day the decoder stops
 * working.
 *
 * WHERE IT CAME FROM. `sips -s format heic` on macOS over a generated PNG, i.e.
 * Apple's own encoder — the same producer as the phone photos this feature is
 * for. Kept as base64 rather than a binary blob in the tree so the fixture is
 * reviewable in a diff and cannot be silently swapped.
 *
 * It is small on purpose: the derivative pipeline's timing is measured in the
 * PR, not in CI, and a 1.3 KB frame proves the same contract as a 3 MB one.
 */

const BASE64 = [
  "AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABw21ldGEAAAAAAAAAIWhkbHIA",
  "AAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAA",
  "AAABAAAADnBpdG0AAAAAAAEAAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABodmMxAAAAABVp",
  "bmZlAgAAAQACAABFeGlmAAAAABppcmVmAAAAAAAAAA5jZHNjAAIAAQABAAAA5mlwcnAAAADFaXBj",
  "bwAAABNjb2xybmNseAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAABAAAAAMAAAAAlp",
  "cm90AAAAABBwaXhpAAAAAAMICAgAAABxaHZjQwEDcAAAALAAAAAAAB7wAPz9+PgAAAsDoAABABdA",
  "AQwB//8DcAAAAwCwAAADAAADAB5wJKEAAQAjQgEBA3AAAAMAsAAAAwAAAwAeoBQgQcGMTiHuRZVN",
  "wICBgCCiAAEACUQBwGFyyERTZAAAABlpcG1hAAAAAAAAAAEAAQaBAgMFhoQAAAAsaWxvYwAAAABE",
  "AAACAAEAAAABAAACRQAAAtcAAgAAAAEAAAH3AAAATgAAAAFtZGF0AAAAAAAAAzUAAAAGRXhpZgAA",
  "TU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQA",
  "AAABAAAAMAAAAAAAAALTKAGvoTfYRnyr7s45rheIhrFUoHqXv8GKSJJ4e4F4UwA0ZOr/8PqUkEG5",
  "1xN+oYxHT+P2IXd1o3CD/Lu1qLn7AWO3NZ7QZexO9Kem2CgtM5+v02wLZx/I36Yxk/uo0rCsa/kP",
  "grIr7EKZ5ZXq0Jn8FSouOdTzEpfsz/5mzd8zrVp3Bw4wlD5Piw92xsaDI9H3cRWdKI7YTuOMQRSc",
  "v0XE1+VM80f+BGKERJ9i4pAkEvBKn5YB/wM+wwTX1f1rOE/OFfqMgtjPErzPDiDBHiIuzLhLroU5",
  "yssZOQdVKTlOS/QpgO19+5AL3TZ8Y/UyeDnXXQDxmbNQFDmCMxONzpJWBDKxmoNnLtbAj/1fnbM6",
  "DaBHz91LwVpCNn2+FmTr+yRSXN3M7byiRdk3hobvsVT+4HOgZLvdcARdLotiMr6/VXxsn1noXhYc",
  "WAfUnG5KC5R9d+jzz4a9U13oQ+l5/NLXkkuMYqHU83Lb/YdQOkH+FVS7FshzvL+L+vHf/wX//3tG",
  "evP/QCXc8VVYCAlYmT9AEEU4cXk4TMlb9P+vI05vzlEmOtDz6bO77mEmrQ0GPOIWH7TzYaKg0oqr",
  "7AZ+Ggg2gD29m3AvjHkWsdh1bTfEZvMqAATnRYa3DanXPXZrn8i+vOECzbNfI5UyUm7pGmCm2Tjh",
  "r2E9Jb2vgXfmUei/kgn+kEOso5DIFLn1I3h9mTIP68vIslQ4MjuhxeA8nNHmFwMjovNTPcKoLkyB",
  "8/vaOEXFVxZuF6EiM+n/oLGwIj0Y+8495zXoj8lyKhiBrX588J8BJRmAMl0tiFEAmdHYby1bkMiM",
  "pkX3v5tgFTNGjyW7qNaJeugrOYRMziADlz3aat3Lr84AcZpq19t6gJ7UAyuNx3/3LP8H/hQNLm6I",
  "Zr5QdTN+kHXn1Q7haASSSdEFzAI10kAn/TZf0D34IAawwRck3U4TmT3wyDaDplZZ1v3ndLf/",
].join("")

/** The image's true dimensions, asserted by the decoder tests. */
export const REAL_HEIC_WIDTH = 64
export const REAL_HEIC_HEIGHT = 48

export const REAL_HEIC_BYTES: Buffer = Buffer.from(BASE64, "base64")
