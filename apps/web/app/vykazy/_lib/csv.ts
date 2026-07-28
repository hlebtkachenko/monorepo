// Delimiter + line splitting shared by every CSV importer in the Výkazy builder
// (deník rows, účtový rozvrh). Pure string work, no I/O.

export function detectDelimiter(headerLine: string): string {
  const semis = (headerLine.match(/;/g) ?? []).length
  const commas = (headerLine.match(/,/g) ?? []).length
  return commas > semis ? "," : ";"
}

/** Split one CSV line, honoring "quoted ""fields"" with the delimiter inside". */
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

/** Quote a field only when it carries the delimiter, a quote, or a newline. */
export function csvField(value: string, delim = ";"): string {
  return value.includes(delim) || value.includes('"') || /[\r\n]/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value
}
