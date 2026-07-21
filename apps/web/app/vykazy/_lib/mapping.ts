// Account -> výkaz-řádek mapping for the statement builder.
//
// Turns an obratová předvaha (trial balance) into the leaf values of the Rozvaha
// (ROZVAHA_AKTIVA + ROZVAHA_PASIVA) and the Výkaz zisku a ztráty (VZZ), per
// vyhláška č. 500/2002 Sb. + směrná účtová osnova. Pure functions, no side
// effects, no org/personal data.
//
// Model
// -----
//  - Mapping is keyed by the 3-digit syntetický účet (first 3 digits of `ucet`).
//  - Rozvaha uses STAVOVÉ hodnoty: the account contribution is its KS
//    (konečný zůstatek = ΣMD − ΣDal).
//      * Aktivní účet  -> aktiva leaf, column "brutto", sign +1 (KS is a debit
//        balance, i.e. positive).
//      * Oprávky (07x/08x/09x, 190–199, 290–291, 390–391, opravkovy=true) and
//        opravné položky reduce netto: they land on the SAME asset leaf but in
//        column "korekce". Their KS is a credit balance (negative), and with
//        sign +1 the korekce cell ends up negative, exactly as on the paper form
//        (netto = brutto + korekce).
//      * Pasivní účet  -> pasiva leaf, column "bezne", sign −1. A pasivní KS is a
//        credit balance (negative), so −1 renders a positive pasiva value.
//        Contra-equity accounts (e.g. 429 neuhrazená ztráta, a debit balance)
//        naturally render negative under the same −1, which is correct.
//  - VZZ uses TOKOVÉ hodnoty (column "bezne"):
//      * Náklady (5xx)  -> cost leaf, contribution = obratMD − obratDal (positive).
//      * Výnosy  (6xx)  -> revenue leaf, contribution = obratDal − obratMD (positive).
//    The náklad/výnos direction is derived from the account class in
//    mapPredvahaToValues; every VZZ target therefore carries sign +1.
//
// Aktiva and pasiva go into SEPARATE VykazValues maps because their řádek numbers
// overlap (aktiva 001–077, pasiva 001–066). The běžné columns are disjoint (aktiva
// writes "brutto"/"korekce", pasiva writes "bezne"), but the shared "minule" column
// would collide, so the two sides never share one map.
//
// Not mapped (return null):
//  - 701 (počáteční účet rozvažný), 702/710 (závěrkové účty) are technical. The
//    opening balances they carried already flow into the výkaz through each
//    rozvahový účet's KS, so mapping them would double-count.
//  - Pasiva A.V. (řádek 022, Výsledek hospodaření běžného účetního období) is
//    deliberately left empty here — it is filled from the VZZ result by the
//    engine, not by any single account. No account maps to it.

import { OSNOVA } from "../_data/osnova"
import type { VykazValues } from "./types"

export interface AccountTarget {
  statement: "rozvaha-aktiva" | "rozvaha-pasiva" | "vzz"
  rada: string // a LEAF řádek in that statement
  col: "brutto" | "korekce" | "bezne"
  sign: 1 | -1 // multiply the account contribution
}

// Builders (keep the table terse and typo-resistant).
const A = (rada: string): AccountTarget => ({
  statement: "rozvaha-aktiva",
  rada,
  col: "brutto",
  sign: 1,
})
const K = (rada: string): AccountTarget => ({
  statement: "rozvaha-aktiva",
  rada,
  col: "korekce",
  sign: 1,
})
const P = (rada: string): AccountTarget => ({
  statement: "rozvaha-pasiva",
  rada,
  col: "bezne",
  sign: -1,
})
const V = (rada: string): AccountTarget => ({
  statement: "vzz",
  rada,
  col: "bezne",
  sign: 1,
})

// 3-digit syntetický účet -> leaf target. Covers every synthetic in the směrná
// osnova (classes 0–6) plus 349 (spojovací/vyrovnávací účet k DPH, not present
// in the reference osnova but common in real books). Class 7 -> handled as null.
const ACCOUNT_MAP: Record<string, AccountTarget> = {
  // ---- Class 0: dlouhodobý majetek --------------------------------------
  // Dlouhodobý nehmotný majetek (aktiva B.I.)
  "010": A("010"), // group
  "012": A("005"), // Nehmotné výsledky vývoje
  "013": A("007"), // Software
  "014": A("008"), // Ostatní ocenitelná práva
  "015": A("009"), // Goodwill
  "019": A("010"), // Ostatní DNM
  // Oprávky k DNM (korekce of the matching DNM leaf)
  "070": K("010"), // group
  "072": K("005"), // oprávky k nehmot. výsledkům vývoje
  "073": K("007"), // oprávky k softwaru
  "074": K("008"), // oprávky k ost. ocenitelným právům
  "075": K("009"), // oprávky ke goodwillu
  "079": K("010"), // oprávky k ostatnímu DNM
  // Dlouhodobý hmotný majetek (aktiva B.II.)
  "020": A("018"), // group (odpisovaný)
  "021": A("017"), // Stavby
  "022": A("018"), // Hmotné movité věci a jejich soubory
  "025": A("021"), // Pěstitelské celky trvalých porostů
  "026": A("022"), // Dospělá zvířata a jejich skupiny
  "029": A("023"), // Jiný DHM
  "030": A("016"), // group (neodpisovaný)
  "031": A("016"), // Pozemky
  "032": A("023"), // Umělecká díla a sbírky -> Jiný DHM
  "097": A("019"), // Oceňovací rozdíl k nabytému majetku
  // Oprávky k DHM
  "080": K("018"), // group
  "081": K("017"), // oprávky ke stavbám
  "082": K("018"), // oprávky k hmotným movitým věcem
  "085": K("021"), // oprávky k pěstitelským celkům
  "086": K("022"), // oprávky k dospělým zvířatům
  "089": K("023"), // oprávky k jinému DHM
  "098": K("019"), // oprávky k oceňovacímu rozdílu
  // Nedokončený DM + pořízení (aktiva B.I.5 / B.II.5 / B.III.7)
  "040": A("026"), // group
  "041": A("013"), // Nedokončený DNM
  "042": A("026"), // Nedokončený DHM
  "043": A("035"), // Pořízení DFM -> Jiný DFM
  // Poskytnuté zálohy na DM
  "050": A("025"), // group
  "051": A("012"), // zálohy na DNM
  "052": A("025"), // zálohy na DHM
  "053": A("036"), // zálohy na DFM
  // Dlouhodobý finanční majetek (aktiva B.III.)
  "060": A("035"), // group
  "061": A("028"), // Podíly - ovládaná nebo ovládající osoba
  "062": A("030"), // Podíly - podstatný vliv
  "063": A("032"), // Ostatní dlouhodobé CP a podíly
  "065": A("032"), // Dluhové CP držené do splatnosti
  "066": A("029"), // Zápůjčky a úvěry - ovládaná
  "067": A("031"), // Zápůjčky a úvěry - podstatný vliv
  "068": A("033"), // Zápůjčky a úvěry - ostatní
  "069": A("035"), // Jiný DFM
  // Opravné položky k DM (korekce)
  "090": K("018"), // group
  "091": K("010"), // OP k DNM
  "092": K("018"), // OP k DHM
  "093": K("013"), // OP k nedokončenému DNM
  "094": K("026"), // OP k nedokončenému DHM
  "095": K("025"), // OP k zálohám na DM
  "096": K("035"), // OP k DFM

  // ---- Class 1: zásoby ---------------------------------------------------
  "110": A("039"), // group materiál
  "111": A("039"), // pořízení materiálu
  "112": A("039"), // materiál na skladě
  "119": A("039"), // materiál na cestě
  "120": A("040"), // group zásoby vlastní činnosti
  "121": A("040"), // nedokončená výroba
  "122": A("040"), // polotovary vlastní výroby
  "123": A("042"), // výrobky
  "124": A("044"), // mladá a ostatní zvířata
  "130": A("043"), // group zboží
  "131": A("043"), // pořízení zboží
  "132": A("043"), // zboží na skladě
  "139": A("043"), // zboží na cestě
  "150": A("045"), // group zálohy na zásoby
  "151": A("045"), // zálohy na materiál
  "152": A("045"), // zálohy na zvířata
  "153": A("045"), // zálohy na zboží
  // Opravné položky k zásobám (korekce)
  "190": K("039"), // group
  "191": K("039"), // OP k materiálu
  "192": K("040"), // OP k nedokončené výrobě
  "193": K("040"), // OP k polotovarům
  "194": K("042"), // OP k výrobkům
  "195": K("044"), // OP k mladým zvířatům
  "196": K("043"), // OP ke zboží
  "197": K("045"), // OP k zálohám na materiál
  "198": K("045"), // OP k zálohám na zboží
  "199": K("045"), // OP k zálohám na zvířata

  // ---- Class 2: krátkodobý finanční majetek + krátkodobé úvěry -----------
  "210": A("072"), // group pokladna
  "211": A("072"), // Pokladna
  "213": A("072"), // Ceniny
  "220": A("073"), // group bankovní účty
  "221": A("073"), // Bankovní účty
  "230": P("050"), // group krátkodobé úvěry
  "231": P("050"), // krátkodobé závazky k úvěrovým institucím
  "232": P("050"), // eskontní úvěry
  "233": P("058"), // krátkodobé úvěry od nebankovních institucí
  "240": P("058"), // group krátkodobé finanční výpomoci
  "241": P("049"), // emitované krátkodobé dluhopisy
  "249": P("058"), // ostatní krátkodobé finanční výpomoci
  "250": A("070"), // group krátkodobý finanční majetek
  "251": A("070"), // majetkové CP k obchodování
  "252": A("070"), // vlastní podíly (krátkodobé)
  "253": A("070"), // dluhové CP k obchodování
  "254": A("069"), // Podíly - ovládaná (C.III.1)
  "255": A("070"), // vlastní dluhopisy
  "256": A("070"), // dluhové CP se splatností do 1 roku
  "257": A("070"), // ostatní CP
  "259": A("070"), // pořizování KFM
  "260": A("073"), // group převody mezi finančními účty
  "261": A("073"), // Peníze na cestě
  // Opravné položky ke KFM (korekce)
  "290": K("070"), // group
  "291": K("070"), // OP ke krátkodobému finančnímu majetku

  // ---- Class 3: zúčtovací vztahy -----------------------------------------
  // Pohledávky (aktiva C.II.2 krátkodobé by default)
  "310": A("058"), // group pohledávky
  "311": A("058"), // Pohledávky z obchodních vztahů
  "312": A("067"), // směnky k inkasu -> jiné pohledávky
  "313": A("067"), // pohledávky za eskontované CP -> jiné pohledávky
  "314": A("065"), // poskytnuté zálohy a závdavky
  "315": A("067"), // ostatní pohledávky -> jiné pohledávky
  // Závazky z obchodních vztahů (pasiva C.II krátkodobé)
  "320": P("052"), // group závazky
  "321": P("052"), // Dluhy z obchodních vztahů
  "322": P("053"), // směnky k úhradě
  "324": P("051"), // přijaté provozní zálohy a závdavky
  "325": P("063"), // ostatní dluhy -> jiné závazky
  // Zaměstnanci a instituce
  "330": P("059"), // group
  "331": P("059"), // Zaměstnanci
  "333": P("059"), // ostatní dluhy vůči zaměstnancům
  "335": A("067"), // pohledávky za zaměstnanci -> jiné pohledávky
  "336": P("060"), // zúčtování se SZ a ZP institucemi
  // Daně a dotace (pasiva Stát - daňové závazky a dotace by default)
  "340": P("061"), // group
  "341": P("061"), // daň z příjmů
  "342": P("061"), // ostatní přímé daně
  "343": P("061"), // daň z přidané hodnoty
  "345": P("061"), // ostatní daně a poplatky
  "346": P("061"), // dotace ze státního rozpočtu
  "347": P("061"), // ostatní dotace
  "349": P("061"), // spojovací/vyrovnávací účet k DPH (not in reference osnova)
  // Pohledávky/dluhy za společníky
  "350": A("062"), // group pohledávky za společníky
  "351": A("059"), // pohledávky - ovládaná (krátkodobé)
  "352": A("060"), // pohledávky - podstatný vliv (krátkodobé)
  "353": A("002"), // pohledávky za upsaný ZK (A.)
  "354": A("062"), // pohledávky za společníky při úhradě ztráty
  "355": A("062"), // ostatní pohledávky za společníky
  "358": A("062"), // pohledávky za společníky sdruženými
  "360": P("057"), // group závazky ke společníkům
  "361": P("054"), // dluhy - ovládaná (krátkodobé)
  "362": P("055"), // dluhy - podstatný vliv (krátkodobé)
  "364": P("057"), // dluhy ke společníkům při rozdělování zisku
  "365": P("057"), // ostatní dluhy ke společníkům
  "366": P("057"), // dluhy ke společníkům ze závislé činnosti
  "367": P("057"), // dluhy z upsaných nesplacených CP
  "368": P("057"), // dluhy ke společníkům sdruženým
  // Jiné pohledávky a závazky
  "370": A("067"), // group
  "371": A("067"), // pohledávky z prodeje obchodního závodu
  "372": P("063"), // dluhy z koupě obchodního závodu -> jiné závazky
  "373": A("067"), // pohledávky/dluhy z pevných termínových operací
  "374": A("067"), // pohledávky z pachtu obchodního závodu
  "375": A("067"), // pohledávky z emitovaných dluhopisů
  "376": A("070"), // nakoupené opce -> krátkodobý finanční majetek
  "377": P("063"), // prodané opce -> jiné závazky
  "378": A("067"), // Jiné pohledávky
  "379": P("063"), // Jiné dluhy
  // Přechodné účty aktiv a pasiv (časové rozlišení)
  "380": A("075"), // group
  "381": A("075"), // náklady příštích období (aktiva D.1)
  "382": A("076"), // komplexní náklady příštích období (aktiva D.2)
  "383": P("065"), // výdaje příštích období (pasiva D.1)
  "384": P("066"), // výnosy příštích období (pasiva D.2)
  "385": A("077"), // příjmy příštích období (aktiva D.3)
  "388": A("066"), // dohadné účty aktivní (C.II.2.4.5)
  "389": P("062"), // dohadné účty pasivní (C.II.8.6)
  // Opravné položky / vnitřní zúčtování
  "390": K("067"), // OP k zúčtovacím vztahům (korekce)
  "391": K("058"), // OP k pohledávkám (korekce of obchodních vztahů)
  "395": A("067"), // vnitřní zúčtování -> jiné pohledávky
  "398": A("067"), // spojovací účet při společnosti -> jiné pohledávky

  // ---- Class 4: vlastní kapitál, rezervy, dlouhodobé závazky -------------
  // Základní kapitál a kapitálové fondy (pasiva A.I / A.II)
  "410": P("004"), // group
  "411": P("004"), // Základní kapitál
  "412": P("008"), // Ážio
  "413": P("010"), // Ostatní kapitálové fondy
  "414": P("011"), // Oceňovací rozdíly z přecenění majetku a dluhů
  "416": P("014"), // Rozdíly z ocenění při přeměnách
  "417": P("013"), // Rozdíly z přeměn
  "418": P("012"), // Oceňovací rozdíly z přecenění při přeměnách
  "419": P("006"), // Změny základního kapitálu
  // Fondy ze zisku a převedené výsledky hospodaření (pasiva A.III / A.IV)
  "420": P("016"), // group
  "421": P("016"), // rezervní fond
  "422": P("016"), // nedělitelný fond
  "423": P("017"), // statutární fondy
  "426": P("021"), // jiný VH minulých let
  "427": P("017"), // ostatní fondy
  "428": P("019"), // Nerozdělený zisk minulých let
  "429": P("020"), // Neuhrazená ztráta minulých let (-)
  // Výsledek hospodaření (A.V řádek 022 is NOT mapped — filled from VZZ result)
  "430": P("021"), // group -> jiný VH minulých let (technical)
  "431": P("021"), // VH ve schvalovacím řízení -> jiný VH minulých let
  "432": P("023"), // zálohy na podíly na zisku (A.VI, "-")
  // Rezervy (pasiva B.)
  "450": P("029"), // group
  "451": P("028"), // rezervy dle zvláštních předpisů
  "452": P("026"), // rezerva na důchody a podobné závazky
  "453": P("027"), // rezerva na daň z příjmů
  "459": P("029"), // ostatní rezervy
  // Dlouhodobé závazky (pasiva C.I.)
  "460": P("035"), // group dlouhodobé závazky k úvěrovým institucím
  "461": P("035"), // Dlouhodobé závazky k úvěrovým institucím
  "462": P("045"), // úvěry od nebankovních institucí -> jiné dl. závazky
  "470": P("045"), // group dlouhodobé závazky
  "471": P("039"), // dlouhodobé dluhy - ovládaná
  "472": P("040"), // dlouhodobé dluhy - podstatný vliv
  "473": P("034"), // emitované dluhopisy (dlouhodobé, ostatní)
  "474": P("045"), // dluhy z pachtu obchodního závodu
  "475": P("036"), // dlouhodobé přijaté zálohy a závdavky
  "478": P("038"), // dlouhodobé směnky k úhradě
  "479": P("045"), // jiné dlouhodobé dluhy
  "480": P("041"), // group odložený daňový závazek/pohledávka
  "481": P("041"), // odložený daňový dluh (default závazek)
  "490": P("021"), // group individuální podnikatel
  "491": P("021"), // účet individuálního podnikatele

  // ---- Class 5: náklady (VZZ) -------------------------------------------
  "500": V("005"), // group spotřebované nákupy
  "501": V("005"), // Spotřeba materiálu
  "502": V("005"), // Spotřeba energie
  "503": V("005"), // spotřeba ost. neskladovatelných dodávek
  "504": V("004"), // Prodané zboží (A.1)
  "510": V("006"), // group služby
  "511": V("006"), // opravy a udržování
  "512": V("006"), // cestovné
  "513": V("006"), // náklady na reprezentaci
  "518": V("006"), // Ostatní služby (A.3)
  "520": V("010"), // group osobní náklady
  "521": V("010"), // Mzdové náklady (D.1)
  "522": V("010"), // příjmy společníků ze závislé činnosti
  "523": V("010"), // odměny členům orgánů
  "524": V("012"), // Zákonné sociální a zdravotní pojištění (D.2.1)
  "525": V("012"), // ostatní sociální pojištění
  "526": V("013"), // sociální náklady individuálního podnikatele (D.2.2)
  "527": V("013"), // zákonné sociální náklady
  "528": V("013"), // ostatní sociální náklady
  "530": V("027"), // group daně a poplatky
  "531": V("027"), // daň silniční
  "532": V("027"), // daň z nemovitých věcí
  "538": V("027"), // Ostatní daně a poplatky (F.3)
  "540": V("029"), // group jiné provozní náklady
  "541": V("025"), // zůstatková cena prodaného DM (F.1)
  "542": V("026"), // prodaný materiál (F.2)
  "543": V("029"), // dary
  "544": V("029"), // Smluvní pokuty a úroky z prodlení
  "545": V("029"), // Ostatní pokuty a penále
  "546": V("029"), // odpis pohledávky
  "547": V("029"), // mimořádné provozní náklady
  "548": V("029"), // Jiné provozní náklady (F.5)
  "549": V("029"), // manka a škody z provozní činnosti
  "550": V("016"), // group odpisy/rezervy/OP v provozní oblasti
  "551": V("016"), // Odpisy DNM a DHM (E.1.1)
  "552": V("028"), // tvorba rezerv dle zvl. předpisů (F.4)
  "554": V("028"), // tvorba ostatních rezerv
  "555": V("028"), // tvorba komplexních nákladů příštích období
  "557": V("016"), // zúčtování oprávky k oceňovacímu rozdílu
  "558": V("019"), // tvorba zákonných OP -> úpravy hodnot pohledávek (E.3)
  "559": V("019"), // tvorba ostatních OP -> úpravy hodnot pohledávek (E.3)
  "560": V("047"), // group finanční náklady
  "561": V("034"), // prodané CP a podíly (G.)
  "562": V("045"), // Úroky (J.2)
  "563": V("047"), // kursové ztráty (K.)
  "564": V("042"), // náklady z přecenění CP (finanční úpravy hodnot, řádek I.)
  "565": V("047"), // mimořádné finanční náklady
  "566": V("047"), // náklady z finančního majetku
  "567": V("047"), // náklady z derivátových operací
  "568": V("047"), // Ostatní finanční náklady (K.)
  "569": V("047"), // manka a škody na finančním majetku
  "570": V("042"), // group rezervy a OP ve finanční oblasti
  "574": V("042"), // tvorba finančních rezerv
  "579": V("042"), // tvorba OP ve finanční činnosti
  "580": V("007"), // group změna stavu zásob vlastní činnosti (B.)
  "581": V("007"), // změna stavu nedokončené výroby
  "582": V("007"), // změna stavu polotovarů
  "583": V("007"), // změna stavu výrobků
  "584": V("007"), // změna stavu zvířat
  "585": V("008"), // aktivace materiálu a zboží (C.)
  "586": V("008"), // aktivace vnitropodnikových služeb
  "587": V("008"), // aktivace DNM
  "588": V("008"), // aktivace DHM
  "590": V("051"), // group daně z příjmů
  "591": V("051"), // Daň z příjmů - splatná (L.1)
  "592": V("052"), // Daň z příjmů - odložená (L.2)
  "595": V("051"), // dodatečné odvody daně z příjmů
  "596": V("054"), // převod podílu na VH společníkům (M.)
  "597": V("029"), // převod provozních nákladů (převodový)
  "598": V("047"), // převod finančních nákladů (převodový)
  "599": V("028"), // tvorba rezervy na daň z příjmů

  // ---- Class 6: výnosy (VZZ) --------------------------------------------
  "600": V("001"), // group tržby za vlastní výkony a zboží
  "601": V("001"), // Tržby za vlastní výrobky (I.)
  "602": V("001"), // Tržby z prodeje služeb (I.)
  "604": V("002"), // Tržby za zboží (II.)
  "640": V("023"), // group jiné provozní výnosy
  "641": V("021"), // tržby z prodeje DM (III.1)
  "642": V("022"), // tržby z prodeje materiálu (III.2)
  "643": V("023"), // přijaté dary v provozní oblasti
  "644": V("023"), // smluvní pokuty a úroky z prodlení
  "646": V("023"), // výnosy z odepsaných pohledávek
  "648": V("023"), // Jiné provozní výnosy (III.3)
  "649": V("023"), // mimořádné provozní výnosy
  "660": V("046"), // group finanční výnosy
  "661": V("046"), // tržby z prodeje CP a podílů
  "662": V("041"), // Úroky výnosové (VI.2)
  "663": V("046"), // kursové zisky
  "664": V("046"), // výnosy z přecenění CP
  "665": V("033"), // výnosy z dlouhodobého finančního majetku (IV.2)
  "666": V("046"), // výnosy z krátkodobého finančního majetku
  "667": V("046"), // výnosy z derivátových operací
  "668": V("046"), // Ostatní finanční výnosy (VII.)
  "669": V("046"), // mimořádné finanční výnosy
  "690": V("023"), // group převodové účty
  "697": V("023"), // převod provozních výnosů
  "698": V("046"), // převod finančních výnosů
}

/**
 * Map a single syntetický účet to its výkaz leaf.
 *
 * `synteticky` may be a 3-digit synthetic or a longer account number; only the
 * first three digits are used. `opravkovy` (from the směrná osnova) redirects an
 * account onto the korekce column of its asset leaf when the table points at a
 * brutto cell — a defensive guard; the 07x/08x/09x/19x/29x/39x rows are already
 * mapped to korekce directly.
 *
 * Returns null for technical accounts (701 počáteční, 702/710 závěrkové) and any
 * synthetic with no leaf.
 */
export function mapAccount(
  synteticky: string,
  opravkovy: boolean,
): AccountTarget | null {
  const syn = synteticky.slice(0, 3)
  const base = ACCOUNT_MAP[syn]
  if (!base) return null
  if (
    opravkovy &&
    base.statement === "rozvaha-aktiva" &&
    base.col === "brutto"
  ) {
    return { ...base, col: "korekce" }
  }
  return { ...base }
}

const OSNOVA_INDEX: Map<string, boolean> = (() => {
  // Lazily-safe module-load index: ucet -> opravkovy. Kept local so this file
  // has no runtime dependency surface beyond the osnova data.
  const index = new Map<string, boolean>()
  for (const account of OSNOVA) index.set(account.ucet, account.opravkovy)
  return index
})()

/**
 * Turn an obratová předvaha into výkaz leaf values.
 *
 * For each account: resolve its opravkovy flag from the směrná osnova (exact
 * 6-digit match; if absent, fall back to false — the synthetic-nature default),
 * map it, accumulate its contribution per (statement, řádek, column) in Kč, then
 * — per the výkaz unit "v celých tisících Kč" — divide by 1000 and round each
 * cell once (Math.round). Rounding is done per cell, not per account, so cent
 * differences do not accumulate.
 *
 * Aktiva, pasiva, and VZZ each get their own map (aktiva + pasiva řádek numbers
 * overlap). Accounts with no mapping (incl. the technical 701/702/710) land in
 * `unmapped`.
 */
export function mapPredvahaToValues(
  ucty: {
    ucet: string
    synteticky: string
    ks: number
    obratMD: number
    obratDal: number
  }[],
): {
  rozvahaAktiva: VykazValues
  rozvahaPasiva: VykazValues
  vzz: VykazValues
  unmapped: string[]
} {
  // Accumulators in Kč, keyed by řádek -> column -> amount.
  const rozvahaAktivaKc: Record<
    string,
    Partial<Record<AccountTarget["col"], number>>
  > = {}
  const rozvahaPasivaKc: Record<
    string,
    Partial<Record<AccountTarget["col"], number>>
  > = {}
  const vzzKc: Record<
    string,
    Partial<Record<AccountTarget["col"], number>>
  > = {}
  const unmapped: string[] = []

  for (const row of ucty) {
    const syn = row.synteticky.slice(0, 3)
    const opravkovy = OSNOVA_INDEX.get(row.ucet) ?? false
    const target = mapAccount(syn, opravkovy)
    if (!target) {
      unmapped.push(row.ucet)
      continue
    }

    let contributionKc: number
    if (target.statement === "vzz") {
      // Toková hodnota: náklady (5xx) = MD − Dal; výnosy (6xx) = Dal − MD.
      const netMovement = syn.startsWith("5")
        ? row.obratMD - row.obratDal
        : row.obratDal - row.obratMD
      contributionKc = netMovement * target.sign
    } else {
      // Stavová hodnota: konečný zůstatek.
      contributionKc = row.ks * target.sign
    }

    const bucket =
      target.statement === "vzz"
        ? vzzKc
        : target.statement === "rozvaha-aktiva"
          ? rozvahaAktivaKc
          : rozvahaPasivaKc
    const line = (bucket[target.rada] ??= {})
    line[target.col] = (line[target.col] ?? 0) + contributionKc
  }

  return {
    rozvahaAktiva: toTisice(rozvahaAktivaKc),
    rozvahaPasiva: toTisice(rozvahaPasivaKc),
    vzz: toTisice(vzzKc),
    unmapped,
  }
}

// v celých tisících Kč: divide each accumulated cell by 1000 and round once.
function toTisice(
  accumulator: Record<string, Partial<Record<AccountTarget["col"], number>>>,
): VykazValues {
  const out: VykazValues = {}
  for (const rada in accumulator) {
    const cols = accumulator[rada]
    const cell: Partial<Record<AccountTarget["col"], number>> = {}
    for (const col in cols) {
      const key = col as AccountTarget["col"]
      cell[key] = Math.round((cols[key] ?? 0) / 1000)
    }
    out[rada] = cell
  }
  return out
}
