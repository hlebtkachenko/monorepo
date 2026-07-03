import { describe, expect, it } from "vitest"
import {
  slugify,
  isReservedSlug,
  RESERVED_SLUGS,
  MIN_SLUG_LENGTH,
  FALLBACK_SLUG,
} from "./slug"

describe("slugify — words + separators", () => {
  it("lowercases and dash-joins words", () => {
    expect(slugify("Acme Holding Group")).toBe("acme-holding-group")
  })
  it("collapses punctuation runs to a single dash", () => {
    expect(slugify("Alfa   ---  Beta")).toBe("alfa-beta")
  })
  it("replaces & with the Czech 'a'", () => {
    expect(slugify("Marks & Spencer")).toBe("marks-a-spencer")
    expect(slugify("Novák & syn")).toBe("novak-a-syn")
  })
  it("replaces + with 'plus'", () => {
    expect(slugify("A+B Studio")).toBe("a-plus-b-studio")
  })
})

describe("slugify — diacritics (Czech + general Latin)", () => {
  it("transliterates Czech diacritics", () => {
    expect(slugify("Škoda")).toBe("skoda")
    expect(slugify("Plzeňský kraj")).toBe("plzensky-kraj")
    expect(slugify("Řež")).toBe("rez")
    expect(slugify("Žižkov")).toBe("zizkov")
    expect(slugify("Čáslav")).toBe("caslav")
  })
  it("maps non-decomposing Latin letters", () => {
    expect(slugify("Łódź")).toBe("lodz")
    expect(slugify("Ø Corp")).toBe("o-corp")
  })
})

describe("slugify — legal-form stripping", () => {
  it("cuts a trailing s.r.o. (comma or space)", () => {
    expect(slugify("Acme, s.r.o.")).toBe("acme")
    expect(slugify("Acme s.r.o.")).toBe("acme")
  })
  it("cuts other Czech forms", () => {
    expect(slugify("Škoda Auto a.s.")).toBe("skoda-auto")
    expect(slugify("Beta spol. s r.o.")).toBe("beta")
    expect(slugify("Gama v.o.s.")).toBe("gama")
    expect(slugify("Delta o.p.s.")).toBe("delta")
    expect(slugify("Epsilon k.s.")).toBe("epsilon")
  })
  it("only cuts a TRAILING form, never a leading/mid word", () => {
    // "Nadace" here is the leading word, not a trailing designator.
    expect(slugify("Nadace ABC")).toBe("nadace-abc")
  })
  it("does not strip when the form IS the whole name (no leading name word)", () => {
    // "s.r.o." -> "s-r-o": the "-s-r-o" token needs a real word before it, so
    // a degenerate form-only input is left as-is rather than collapsing away.
    expect(slugify("s.r.o.")).toBe("s-r-o")
  })
})

describe("slugify — length rules", () => {
  it(`falls back below ${MIN_SLUG_LENGTH} chars`, () => {
    expect(slugify("A")).toBe(FALLBACK_SLUG)
    expect(slugify("AB")).toBe(FALLBACK_SLUG)
    expect(slugify("!!!")).toBe(FALLBACK_SLUG)
    expect(slugify("")).toBe(FALLBACK_SLUG)
  })
  it("keeps an exactly-3-char slug", () => {
    expect(slugify("ABC")).toBe("abc")
  })
  it("falls back when a form strip leaves too little", () => {
    expect(slugify("AB s.r.o.")).toBe(FALLBACK_SLUG)
  })
  it("caps at 48 characters with no trailing dash", () => {
    const long = "Alfa Beta Gama Delta Epsilon Zeta Eta Theta Iota Kappa"
    const s = slugify(long)
    expect(s.length).toBeLessThanOrEqual(48)
    expect(s.endsWith("-")).toBe(false)
  })
})

describe("reserved slugs", () => {
  it("flags router + brand + accounting reserved names", () => {
    for (const r of ["workspace", "admin", "api", "afframe", "dph", "vat"]) {
      expect(isReservedSlug(r)).toBe(true)
    }
  })
  it("does not flag a normal company slug", () => {
    expect(isReservedSlug("acme")).toBe(false)
    expect(isReservedSlug("skoda-auto")).toBe(false)
  })
  it("does not reserve the fallback slug (so it stays usable)", () => {
    expect(RESERVED_SLUGS.has(FALLBACK_SLUG)).toBe(false)
  })
})
