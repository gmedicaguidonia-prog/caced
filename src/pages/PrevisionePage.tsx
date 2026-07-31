import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dbLocale } from '../lib/db'
import type { CalcoloMese, RaccoltaMese } from '../lib/db'
import { euro, dataIt, meseIt, meseOggi, mesePiu } from '../lib/formato'

export default function PrevisionePage() {
  const [mese, setMese] = useState(mesePiu(meseOggi(), -1))
  const [r, setR] = useState<RaccoltaMese | null>(null)

  useEffect(() => {
    let vivo = true
    void dbLocale.calcoli.mese(mese).then(({ data }) => {
      if (vivo) setR(data)
    })
    return () => {
      vivo = false
    }
  }, [mese])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-cielo-800">Previsione Compensi</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMese(mesePiu(mese, -1))}
            className="rounded-lg border border-cielo-300 px-3 py-1.5 text-cielo-700 transition hover:bg-cielo-50"
          >
            ‹
          </button>
          <span className="min-w-44 text-center text-lg font-semibold text-cielo-800">
            Ore di {meseIt(mese)}
          </span>
          <button
            onClick={() => setMese(mesePiu(mese, 1))}
            className="rounded-lg border border-cielo-300 px-3 py-1.5 text-cielo-700 transition hover:bg-cielo-50"
          >
            ›
          </button>
        </div>
      </div>

      {r && r.totale.ore === 0 && r.totale.reperibilita === 0 && (
        <div className="rounded-2xl border border-cielo-200 bg-panna p-10 text-center">
          <p className="text-lg font-semibold text-cielo-800">Nessun turno inserito in {meseIt(mese)}</p>
          <p className="mt-2 text-sm text-cielo-600">
            Non c'è nulla da calcolare. Segna i turni nel registro e la previsione comparirà qui.
          </p>
          <Link
            to="/turni"
            className="mt-4 inline-block rounded-lg bg-cielo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-cielo-600"
          >
            Vai al Registro Turni
          </Link>
        </div>
      )}

      {r && (r.totale.ore > 0 || r.totale.reperibilita > 0) && (
        <>
          <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-cielo-200 bg-panna p-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-cielo-500">Netto previsto</p>
              <p className="text-4xl font-bold text-cielo-800">{euro(r.totale.netto)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-cielo-500">Rata</p>
              <p className="text-xl font-semibold text-cielo-700">{meseIt(r.rata)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-cielo-500">Accredito previsto</p>
              <p className="text-xl font-semibold text-cielo-700">{dataIt(r.valuta)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-cielo-500">Ore totali</p>
              <p className="text-xl font-semibold text-cielo-700">{r.totale.ore} h</p>
            </div>
          </div>

          {r.benzina.stimato && r.totale.ore > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              ⛽ Prezzo benzina non ancora noto per {meseIt(mese)}: il chilometrico è stimato
              {r.benzina.prezzo ? ` con ${r.benzina.prezzo.toLocaleString('it-IT')} €/L` : ''}
              {r.benzina.da ? ` (ultimo valore, ${meseIt(r.benzina.da)})` : ''}. Si sistema da solo
              quando importi il cedolino.
            </p>
          )}

          <TabellaCalcolo
            titolo={`Totale (${r.postazioni
              .filter((p) => p.calcolo.ore > 0)
              .map((p) => p.calcolo.ore + 'h')
              .join(' + ')})`}
            c={r.totale}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            {r.postazioni
              .filter((p) => p.calcolo.ore > 0 || p.calcolo.reperibilita > 0)
              .map((p) => (
                <TabellaCalcolo key={p.postazione.id} titolo={p.postazione.nome} c={p.calcolo} compatta />
              ))}
          </div>

          <p className="text-xs text-cielo-500">
            Tariffe applicate: onorario {euro(r.totale.tariffe.onorario)}/h (ACN) + {euro(r.totale.tariffe.air)}/h
            (A.I.R. Lazio) · reperibilità {euro(r.totale.tariffe.reperibilita)}/turno · superfestivo +
            {euro(r.totale.tariffe.superfestivo)}/h · chilometrico = prezzo di 1 L di benzina per ora (ACN art. 72
            c.2) · ENPAM {r.totale.tariffe.enpam}% · ritenuta d'acconto {r.totale.tariffe.ra}%.
          </p>
        </>
      )}
    </div>
  )
}

function TabellaCalcolo({ titolo, c, compatta }: { titolo: string; c: CalcoloMese; compatta?: boolean }) {
  const righe: [string, string, number][] = [
    [`Onorario ACN (${c.ore}h × ${c.tariffe.onorario.toLocaleString('it-IT')} €)`, 'onorario', c.importi.onorario],
    [`Incremento A.I.R. (${c.ore}h × ${c.tariffe.air.toLocaleString('it-IT')} €)`, 'air', c.importi.air],
    [
      `Maggiorazione superfestivo (${c.oreSuperfestive}h × ${c.tariffe.superfestivo.toLocaleString('it-IT')} €)`,
      'superfestivo',
      c.importi.superfestivo,
    ],
    [
      `Reperibilità (${c.reperibilita} × ${c.tariffe.reperibilita.toLocaleString('it-IT')} €)`,
      'reperibilita',
      c.importi.reperibilita,
    ],
    [
      `Chilometrico (${c.ore}h × ${c.benzinaPrezzo ? c.benzinaPrezzo.toLocaleString('it-IT') : '?'} €/L)`,
      'benzina',
      c.importi.benzina,
    ],
  ]
  return (
    <div className="rounded-2xl border border-cielo-200 bg-panna p-5">
      <h2 className={`font-semibold text-cielo-800 ${compatta ? 'text-base' : 'text-lg'}`}>{titolo}</h2>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {righe
            .filter(([, , importo]) => importo !== 0)
            .map(([nome, chiave, importo]) => (
              <tr key={chiave} className="border-b border-cielo-100">
                <td className="py-1.5 pr-2 text-cielo-700">{nome}</td>
                <td className="py-1.5 text-right font-medium text-cielo-800">{euro(importo)}</td>
              </tr>
            ))}
          <tr className="border-b border-cielo-200">
            <td className="py-1.5 pr-2 font-semibold text-cielo-800">Lordo</td>
            <td className="py-1.5 text-right font-semibold text-cielo-800">{euro(c.lordo)}</td>
          </tr>
          <tr>
            <td className="py-1.5 pr-2 text-cielo-700">ENPAM ({c.tariffe.enpam}%)</td>
            <td className="py-1.5 text-right text-red-700">− {euro(c.enpam)}</td>
          </tr>
          <tr className="border-b border-cielo-100">
            <td className="py-1.5 pr-2 text-cielo-700">Ritenuta d'acconto ({c.tariffe.ra}% su {euro(c.imponibile)})</td>
            <td className="py-1.5 text-right text-red-700">− {euro(c.ritenuta)}</td>
          </tr>
          <tr>
            <td className="py-2 pr-2 text-base font-bold text-cielo-800">Netto</td>
            <td className="py-2 text-right text-base font-bold text-cielo-800">{euro(c.netto)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
