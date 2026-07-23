"use server"

// Server action: render the invoice as ISDOC 6.0.1 XML. @workspace/filing runs
// here in the Node server, never in the client bundle — and we import strictly
// from the "@workspace/filing/isdoc" subpath so the xmllint-wasm validator (a
// root-barrel export) is never pulled into the web build. The mapping is a pure
// function (isdoc-map.ts); this action only calls the writer and shields the
// client from throws, returning a Czech error instead.

import { generateIsdoc } from "@workspace/filing/isdoc"

import type { FakturaceDoc } from "./types"
import { mapToIsdoc } from "./isdoc-map"

export async function buildIsdocXml(
  doc: FakturaceDoc,
): Promise<{ ok: true; xml: string } | { ok: false; error: string }> {
  try {
    const xml = generateIsdoc(mapToIsdoc(doc))
    return { ok: true, xml }
  } catch {
    return {
      ok: false,
      error:
        "ISDOC se nepodařilo vytvořit — zkontrolujte povinná pole (číslo faktury, datumy, účet, strany).",
    }
  }
}
