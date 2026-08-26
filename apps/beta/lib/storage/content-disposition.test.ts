/**
 * RFC 5987 / RFC 6266, exercised with the filenames a Czech construction firm
 * actually produces — and with the ones an attacker would.
 */
import { describe, expect, it } from "vitest"

import {
  asciiFallbackFilename,
  baseFilename,
  contentDispositionHeader,
  rfc5987Encode,
} from "./content-disposition"

describe("rfc5987Encode", () => {
  it("percent-encodes Czech diacritics as UTF-8", () => {
    // ř = U+0159 = C5 99, í = U+00ED = C3 AD.
    expect(rfc5987Encode("příloha.pdf")).toBe("UTF-8''p%C5%99%C3%ADloha.pdf")
  })

  it("encodes the space, which is not an attr-char", () => {
    expect(rfc5987Encode("Faktura 2026.pdf")).toBe("UTF-8''Faktura%202026.pdf")
  })

  it("leaves an ASCII-safe name untouched apart from the prefix", () => {
    expect(rfc5987Encode("faktura-2026.pdf")).toBe("UTF-8''faktura-2026.pdf")
  })

  it("encodes every character that could end the header value early", () => {
    const encoded = rfc5987Encode('a"b;c,d\r\ne')
    expect(encoded).toBe("UTF-8''a%22b%3Bc%2Cd%0D%0Ae")
    expect(encoded).not.toMatch(/["\r\n;,]/)
  })
})

describe("baseFilename", () => {
  it.each([
    ["../../etc/passwd", "etc/passwd → passwd", "passwd"],
    ["C:\\Windows\\win.ini", "windows path", "win.ini"],
    ["/var/log/syslog", "posix path", "syslog"],
    ["...hidden.pdf", "leading dots", "hidden.pdf"],
    ["  Faktura.pdf  ", "surrounding space", "Faktura.pdf"],
  ])("strips %s (%s)", (input, _label, expected) => {
    expect(baseFilename(input)).toBe(expected)
  })
})

describe("asciiFallbackFilename", () => {
  it("replaces everything unsafe rather than transliterating", () => {
    expect(asciiFallbackFilename("Faktura Nováková 03-2026.pdf")).toBe(
      "Faktura_Nov_kov__03-2026.pdf",
    )
  })

  it("never returns an empty name", () => {
    expect(asciiFallbackFilename("ř")).toBe("dokument")
    expect(asciiFallbackFilename("")).toBe("dokument")
  })

  it("bounds the length", () => {
    expect(asciiFallbackFilename(`${"a".repeat(400)}.pdf`).length).toBe(100)
  })
})

describe("contentDispositionHeader", () => {
  it("emits both parameters, attachment by default", () => {
    expect(
      contentDispositionHeader("attachment", "Příjmový doklad č. 12.pdf"),
    ).toBe(
      'attachment; filename="P__jmov__doklad__._12.pdf"; ' +
        "filename*=UTF-8''P%C5%99%C3%ADjmov%C3%BD%20doklad%20%C4%8D.%2012.pdf",
    )
  })

  it("emits inline when the caller decided inline", () => {
    expect(contentDispositionHeader("inline", "stavba.png")).toBe(
      "inline; filename=\"stavba.png\"; filename*=UTF-8''stavba.png",
    )
  })

  it("cannot be broken out of by a hostile filename", () => {
    const header = contentDispositionHeader(
      "attachment",
      'evil";\r\nSet-Cookie: a=b\r\n\r\n<html>.pdf',
    )
    // No CR or LF anywhere: response splitting is off the table.
    expect(header).not.toMatch(/[\r\n]/)
    // One quoted-string, opened and closed exactly once — the `"` the attacker
    // supplied is gone, so no extra parameter can be appended.
    expect(header.match(/"/g)).toHaveLength(2)
    // The header still has exactly the three parts it should, and the hostile
    // characters survive only inside the percent-encoded form.
    expect(header).toMatch(
      /^attachment; filename="[A-Za-z0-9._-]+"; filename\*=UTF-8''[A-Za-z0-9!#$&+^_`|~.%-]+$/,
    )
    expect(header).toContain("%0D%0A")
  })

  it("handles a filename that is only a path", () => {
    expect(contentDispositionHeader("attachment", "../../")).toContain(
      "filename*=UTF-8''dokument",
    )
  })
})
