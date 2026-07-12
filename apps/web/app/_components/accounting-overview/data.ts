import type { LaunchpadSection } from "@workspace/ui/blocks/content-panel"

/**
 * Launchpad nav structure for the accounting module overview hub. Lays out the
 * accounting book pages as `single` cards, plus a grouped "Výstupy" section for
 * the statutory outputs (DPH přiznání, Kontrolní hlášení, Souhrnné hlášení,
 * DPPO, Účetní závěrka).
 *
 * `href` is a RELATIVE page slug — the consuming page prefixes it with the org
 * (`/${orgSlug}/${href}`) so the block stays org-agnostic. A real page swaps
 * this fixture for its own nav-derived data; the block is otherwise unchanged.
 */
export const BASE_SECTIONS: LaunchpadSection[] = [
  {
    id: "books",
    kind: "single",
    pages: [
      {
        id: "denik",
        title: "Deník",
        description: "Chronologický zápis účetních dokladů období (§ 13).",
        icon: "BookOpen",
        href: "accounting/journal",
      },
      {
        id: "ledger",
        title: "Hlavní kniha",
        description: "Obratová předvaha — počáteční, obraty MD/Dal, konečný.",
        icon: "BookOpenText",
        href: "accounting/ledger",
      },
      {
        id: "saldokonto",
        title: "Saldokonto",
        description: "Nespárované pohledávky a závazky podle protistrany.",
        icon: "Users",
        href: "accounting/saldokonto",
      },
      {
        id: "chart-of-accounts",
        title: "Účtový rozvrh",
        description: "Syntetické a analytické účty účetní jednotky.",
        icon: "Shapes",
        href: "accounting/chart-of-accounts",
      },
      {
        id: "doklad",
        title: "Doklad",
        description: "Detail účetního dokladu — položky a zaúčtování.",
        icon: "FileText",
        href: "documents/doklad",
      },
    ],
  },
  {
    id: "outputs",
    kind: "group",
    label: "Výstupy",
    pages: [
      {
        id: "dph-priznani",
        title: "DPH přiznání",
        description: "Přiznání k dani z přidané hodnoty (§ 101).",
        icon: "ReceiptEuro",
        href: "closing/vat/dap",
      },
      {
        id: "kontrolni-hlaseni",
        title: "Kontrolní hlášení",
        description: "Kontrolní hlášení DPH podle protistran (§ 101c).",
        icon: "FileSpreadsheet",
        href: "closing/vat/kh",
      },
      {
        id: "souhrnne-hlaseni",
        title: "Souhrnné hlášení",
        description: "Souhrnné hlášení o plněních do EU (§ 102).",
        icon: "FileText",
        href: "closing/vat/sh",
      },
      {
        id: "dppo",
        title: "DPPO",
        description: "Přiznání k dani z příjmů právnických osob.",
        icon: "Calculator",
        href: "closing/income-tax/dppo",
      },
      {
        id: "ucetni-zaverka",
        title: "Účetní závěrka",
        description: "Rozvaha, výkaz zisku a ztráty, příloha.",
        icon: "BarChart3",
        href: "closing/year-end/statements",
      },
    ],
  },
]
