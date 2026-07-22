"use client"

// Section 3 — the services, grouped by facturing type, with a PER-ITEM discount
// on each line, plus the prepaid advances (zálohy). This section routes into
// BOTH output documents with no further entry.

import { Button } from "@workspace/ui/components/button"

import { SERVICE_KINDS, type ServiceKind, type SlevaMode } from "../_lib/types"
import {
  formatKc,
  formatNum,
  lineDiscount,
  lineGross,
  lineTotal,
} from "../_lib/calc"
import { useFakturace } from "../_lib/state"
import { INPUT_CLASS, NumberField, Section, TextField } from "./fields"

function ServiceRow({ id }: { id: string }) {
  const { doc, updateService, removeService } = useFakturace()
  const item = doc.services.find((s) => s.id === id)
  if (!item) return null
  return (
    <div className="rounded border border-neutral-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <TextField
          label="Popis"
          value={item.popis}
          onChange={(v) => updateService(id, { popis: v })}
          className="sm:col-span-5"
        />
        <NumberField
          label="Množství"
          value={item.mnozstvi}
          onChange={(v) => updateService(id, { mnozstvi: v })}
          className="sm:col-span-2"
        />
        <TextField
          label="Jednotka"
          value={item.jednotka}
          onChange={(v) => updateService(id, { jednotka: v })}
          className="sm:col-span-2"
        />
        <NumberField
          label="Cena / j. (Kč)"
          value={item.cena}
          onChange={(v) => updateService(id, { cena: v })}
          className="sm:col-span-3"
        />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-12">
        <TextField
          label="Období (nepovinné)"
          value={item.obdobi}
          onChange={(v) => updateService(id, { obdobi: v })}
          placeholder="např. 06/2025"
          className="sm:col-span-3"
        />
        <TextField
          label="Poznámka do reportu"
          value={item.poznamka}
          onChange={(v) => updateService(id, { poznamka: v })}
          placeholder="co bylo uděláno (pro klientovu účetní)"
          className="sm:col-span-5"
        />
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-neutral-600">Sleva</span>
          <select
            value={item.sleva.mode}
            onChange={(e) =>
              updateService(id, {
                sleva: { ...item.sleva, mode: e.target.value as SlevaMode },
              })
            }
            className={INPUT_CLASS}
          >
            <option value="none">Žádná</option>
            <option value="percent">%</option>
            <option value="fixed">Kč</option>
          </select>
        </label>
        {item.sleva.mode === "none" ? (
          <div className="sm:col-span-2" />
        ) : (
          <NumberField
            label={item.sleva.mode === "percent" ? "Sleva (%)" : "Sleva (Kč)"}
            value={item.sleva.value}
            onChange={(v) =>
              updateService(id, { sleva: { ...item.sleva, value: v } })
            }
            className="sm:col-span-2"
          />
        )}
      </div>
      <div className="mt-2 flex items-center justify-end gap-3 text-sm">
        {lineDiscount(item) > 0 ? (
          <span className="text-xs text-neutral-500">
            {formatKc(lineGross(item))} − {formatKc(lineDiscount(item))} =
          </span>
        ) : null}
        <span className="font-semibold text-black">
          {formatKc(lineTotal(item))}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeService(id)}
        >
          Smazat
        </Button>
      </div>
    </div>
  )
}

function KindGroup({ kind, label }: { kind: ServiceKind; label: string }) {
  const { doc, addService } = useFakturace()
  const items = doc.services.filter((s) => s.kind === kind)
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-100/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">{label}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addService(kind)}
        >
          + Přidat
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-400">Žádné položky.</p>
      ) : (
        <div className="space-y-2">
          {items.map((s) => (
            <ServiceRow key={s.id} id={s.id} />
          ))}
        </div>
      )}
    </div>
  )
}

function ZalohyEditor() {
  const { doc, addZaloha, updateZaloha, removeZaloha, totals } = useFakturace()
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">
          Uhrazené zálohy (odečet)
        </h3>
        <Button type="button" variant="outline" size="sm" onClick={addZaloha}>
          + Přidat zálohu
        </Button>
      </div>
      {doc.zalohy.length === 0 ? (
        <p className="text-xs text-neutral-400">Žádné zálohy.</p>
      ) : (
        <div className="space-y-2">
          {doc.zalohy.map((z) => (
            <div
              key={z.id}
              className="grid grid-cols-1 gap-2 rounded border border-neutral-200 p-2 sm:grid-cols-12"
            >
              <TextField
                label="Číslo dokladu"
                value={z.cisloDokladu}
                onChange={(v) => updateZaloha(z.id, { cisloDokladu: v })}
                className="sm:col-span-3"
              />
              <TextField
                label="Datum úhrady"
                type="date"
                value={z.datumUhrady}
                onChange={(v) => updateZaloha(z.id, { datumUhrady: v })}
                className="sm:col-span-3"
              />
              <NumberField
                label="Částka (Kč)"
                value={z.castka}
                onChange={(v) => updateZaloha(z.id, { castka: v })}
                className="sm:col-span-3"
              />
              <TextField
                label="Popis"
                value={z.popis}
                onChange={(v) => updateZaloha(z.id, { popis: v })}
                className="sm:col-span-2"
              />
              <div className="flex items-end sm:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeZaloha(z.id)}
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
          <p className="text-right text-xs text-neutral-600">
            Zálohy celkem: {formatKc(totals.zalohySum)}
            {totals.zalohyApplied < totals.zalohySum
              ? ` (odečteno ${formatKc(totals.zalohyApplied)})`
              : ""}
          </p>
        </div>
      )}
    </div>
  )
}

export function Services() {
  const { totals } = useFakturace()
  return (
    <Section
      id="services"
      title="3. Služby"
      description="Poskytnuté služby seskupené podle typu fakturace. Slouží pro fakturu i report."
    >
      <div className="space-y-3">
        {SERVICE_KINDS.map((k) => (
          <KindGroup key={k.kind} kind={k.kind} label={k.label} />
        ))}
        <ZalohyEditor />
        <p className="text-right text-sm">
          Součet služeb: <strong>{formatKc(totals.servicesGross)}</strong>
          {totals.slevaTotal > 0
            ? ` · sleva −${formatKc(totals.slevaTotal)} · po slevě ${formatKc(totals.servicesNet)}`
            : ""}
          {totals.hoursTotal > 0
            ? ` · ${formatNum(totals.hoursTotal)} hod`
            : ""}
        </p>
      </div>
    </Section>
  )
}
