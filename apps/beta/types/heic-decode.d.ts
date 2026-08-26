/**
 * `heic-decode` ships no type declarations, so they live here.
 *
 * The package is a thin, tested wrapper over `libheif-js/wasm-bundle` — the
 * emscripten build of libheif, which is what actually decodes the HEVC-coded
 * image an iPhone writes. Only the single-image entry point is declared: beta
 * never wants the burst/sequence variants (`decode.all`), and a declaration for
 * an API nobody calls is a promise nobody checks.
 *
 * `data` is RGBA, 4 bytes per pixel, top-left origin — the layout
 * `lib/storage/rgba-resize.ts` consumes.
 */
declare module "heic-decode" {
  type HeicImage = {
    width: number
    height: number
    data: Uint8ClampedArray
  }

  function decode(input: { buffer: Uint8Array }): Promise<HeicImage>

  export default decode
}
