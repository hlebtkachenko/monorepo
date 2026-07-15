// Generic inbound XML core: parse a document into a plain object tree, for round-trip
// checks and (later) loading official XML back into the platform.

import { XMLParser } from "fast-xml-parser"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
})

/** Strip a leading UTF-8 BOM — fast-xml-parser can choke on a BOM before the XML prolog. */
function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
}

/** Parse an XML document string into a plain object tree. */
export function parse(xml: string): unknown {
  return parser.parse(stripBom(xml))
}
