// Generic outbound XML core: build an explicitly ordered element tree and serialize it
// with fast-xml-parser's XMLBuilder. Element order and self-closing behaviour are
// XSD-critical for the filing formats, so nodes are constructed in a preserveOrder shape
// (an ordered array of single-tag objects) rather than from an unordered plain object.

import { XMLBuilder } from "fast-xml-parser"

/** A fast-xml-parser preserveOrder node: one tag key → ordered children, optional `:@` attributes. */
export type XmlNode = Record<string, unknown>
export type XmlAttrs = Record<string, string | number>

const ATTR_GROUP = ":@"
const ATTR_PREFIX = "@_"

function buildAttrs(a?: XmlAttrs): Record<string, string> | undefined {
  if (!a) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(a)) out[`${ATTR_PREFIX}${k}`] = String(v)
  return Object.keys(out).length > 0 ? out : undefined
}

/** Container element with ordered children. */
export function el(
  tag: string,
  children: XmlNode[] = [],
  attrs?: XmlAttrs,
): XmlNode {
  const node: XmlNode = { [tag]: children }
  const at = buildAttrs(attrs)
  if (at) node[ATTR_GROUP] = at
  return node
}

/** Leaf element carrying text; a null/undefined value produces a self-closing empty element. */
export function leaf(
  tag: string,
  text?: string | number | null,
  attrs?: XmlAttrs,
): XmlNode {
  const children: XmlNode[] =
    text === undefined || text === null ? [] : [{ "#text": String(text) }]
  return el(tag, children, attrs)
}

const builder = new XMLBuilder({
  preserveOrder: true,
  format: true,
  indentBy: "  ",
  ignoreAttributes: false,
  suppressEmptyNode: true,
})

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n'

/** Serialize a root node to a UTF-8 XML document string (with prolog). */
export function serialize(root: XmlNode): string {
  const body = (builder.build([root]) as string).replace(/^\s+/, "")
  return XML_DECLARATION + body
}
