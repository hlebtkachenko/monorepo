import Link from "next/link"

// /vykazy/dph: landing for the three statutory VAT filings. Each one is a
// projection of the same evidence pro účely DPH (§ 100 ZDPH), exported as
// official Finanční správa EPO XML for upload to the daňový portál.

const FORMS = [
  {
    href: "/vykazy/dph/priznani",
    title: "Přiznání k DPH",
    code: "DPHDP3",
    text: "Řádky 1 až 66 podle zákona č. 235/2004 Sb. Měsíční nebo čtvrtletní podle § 99a.",
  },
  {
    href: "/vykazy/dph/kh",
    title: "Kontrolní hlášení",
    code: "DPHKH1",
    text: "Oddíly A.1 až B.3 podle § 101c a násl. Právnická osoba podává vždy měsíčně (§ 101e odst. 1).",
  },
  {
    href: "/vykazy/dph/sh",
    title: "Souhrnné hlášení VIES",
    code: "DPHSHV",
    text: "Dodání zboží a služby do jiných členských států podle § 102. Čtvrtletně jen u samotných služeb.",
  },
]

export default function DphPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link href="/vykazy" className="text-sm text-primary hover:underline">
          ← Účetní výkazy
        </Link>
        <h1 className="mt-2 text-xl font-bold text-foreground">
          Daň z přidané hodnoty
        </h1>
        <p className="text-sm text-muted-foreground">
          Tři podání z jedné evidence. XML se vytváří i kontroluje proti
          oficiálnímu XSD schématu přímo ve vašem prohlížeči.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {FORMS.map((f) => (
          <li key={f.href}>
            <Link
              href={f.href}
              className="block h-full rounded-md border border-border p-4 transition-colors hover:border-primary"
            >
              <p className="font-mono text-xs text-muted-foreground">
                {f.code}
              </p>
              <p className="mt-1 font-semibold text-foreground">{f.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="space-y-2 rounded-md border border-border p-4">
        <h2 className="text-sm font-semibold">Proč se nevychází z deníku</h2>
        <p className="text-sm text-muted-foreground">
          Účetní deník je účetní záznam. Podklady pro DPH stojí na samostatné
          evidenci podle § 100 odst. 1 ZDPH, vedené „v členění potřebném pro
          sestavení daňového přiznání, souhrnného hlášení nebo kontrolního
          hlášení“. Deník neobsahuje DIČ protistrany, datum povinnosti přiznat
          daň ani evidenční číslo dokladu dodavatele a neumí odlišit pořízení z
          EU od tuzemského režimu přenesení — všechny účtují 343 proti 343.
          Evidence se proto zadává nebo importuje samostatně; deník slouží ke
          kontrolním vazbám.
        </p>
      </section>
    </main>
  )
}
