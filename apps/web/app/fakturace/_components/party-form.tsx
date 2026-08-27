"use client"

// Shared identification editor for a supplier / customer Party, with an IČO
// field paired with a "Načíst z ARES" lookup that fills the block. Binds to the
// context via setParty(which, …).

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useFakturace, type PartyKey } from "../_lib/state"
import { lookupAresParty } from "../_lib/ares-action"
import { INPUT_CLASS, TextField } from "./fields"

type AresStatus = "idle" | "loading" | "success" | "error"

function IcoField({ which }: { which: PartyKey }) {
  const { doc, setParty } = useFakturace()
  const party = doc[which]
  const [status, setStatus] = useState<AresStatus>("idle")
  const [message, setMessage] = useState("")

  const load = async () => {
    setStatus("loading")
    setMessage("")
    const result = await lookupAresParty(party.ico)
    if (result.ok) {
      setParty(which, result.data)
      setStatus("success")
      setMessage("Údaje byly načteny z ARES.")
    } else {
      setStatus("error")
      setMessage(result.error)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-600">IČO</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={party.ico}
          onChange={(e) => setParty(which, { ico: e.target.value })}
          className={cn(INPUT_CLASS, "min-w-[7rem] flex-1")}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={status === "loading" || party.ico.trim() === ""}
          onClick={() => void load()}
        >
          {status === "loading" ? "Načítám…" : "Načíst z ARES"}
        </Button>
      </div>
      {message ? (
        <span
          className={cn(
            "text-xs",
            status === "error" ? "text-red-600" : "text-green-600",
          )}
        >
          {message}
        </span>
      ) : null}
    </div>
  )
}

export function PartyForm({ which }: { which: PartyKey }) {
  const { doc, setParty } = useFakturace()
  const party = doc[which]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <TextField
        label="Obchodní firma / jméno"
        value={party.nazev}
        onChange={(v) => setParty(which, { nazev: v })}
        className="sm:col-span-2"
      />
      <IcoField which={which} />
      <TextField
        label="DIČ"
        value={party.dic}
        onChange={(v) => setParty(which, { dic: v })}
        placeholder="neplátce — nechte prázdné"
      />
      <TextField
        label="Ulice"
        value={party.ulice}
        onChange={(v) => setParty(which, { ulice: v })}
      />
      <TextField
        label="Č.p. / č.o."
        value={party.cislo}
        onChange={(v) => setParty(which, { cislo: v })}
      />
      <TextField
        label="PSČ"
        value={party.psc}
        onChange={(v) => setParty(which, { psc: v })}
      />
      <TextField
        label="Obec"
        value={party.obec}
        onChange={(v) => setParty(which, { obec: v })}
      />
      <TextField
        label="Stát"
        value={party.stat}
        onChange={(v) => setParty(which, { stat: v })}
      />
      <TextField
        label="E-mail"
        type="email"
        value={party.email}
        onChange={(v) => setParty(which, { email: v })}
      />
      <TextField
        label="Telefon"
        type="tel"
        value={party.telefon}
        onChange={(v) => setParty(which, { telefon: v })}
      />
      <TextField
        label="Zápis v rejstříku"
        value={party.zapisRejstrik}
        onChange={(v) => setParty(which, { zapisRejstrik: v })}
        placeholder="živnostenský / obchodní rejstřík"
        className="sm:col-span-2 lg:col-span-3"
      />
    </div>
  )
}
