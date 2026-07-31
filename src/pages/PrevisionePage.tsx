import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dbLocale } from '../lib/db'
import type { CalcoloMese, RaccoltaMese, Riconciliazione } from '../lib/db'
import { useMese } from '../hooks/useMese'
import { euro, dataIt, meseIt } from '../lib/formato'

export default function PrevisionePage() {
  const { mese } = useMese()
  const [r, setR] = useState<RaccoltaMese | null>(null)
  /** confronto con il cedolino della rata corrispondente, se già arrivato */
  const [confronto, setConfronto] = useState<Riconciliazione | null>(null)

  useEffect(() => {
    let vivo = true
    setR(null)
    setConfronto(null)
    void dbLocale.calcoli.mese(mese).then(async ({ data }) => {
      if (!vivo) return
      setR(data)
      if (!data) return
      // il cedolino che paga queste ore è quello della rata successiva
      const { data: elenco } = await dbLocale.cedolini.list()
      const ced = (elenco ?? []).find((c) => c.rata === data.rata)
      if (!ced || !vivo) return
      const { data: ric } = await dbLocale.cedolini.riconcilia(ced.id)
      if (vivo) setConfronto(ric)
    })
    return () => {
      vivo = false
    }
  }, [mese])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-cielo-800">
        Previsione Compensi — ore di {meseIt(mese)}
      </h1>

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
          <div className="grid gap-4 lg:grid-cols-2">
            {/* previsione calcolata dalle ore dichiarate */}
            <div className="rounded-2xl border border-cielo-200 bg-panna p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-cielo-500">
                Previsto in base ai turni
              </p>
              <p className="mt-1 text-4xl font-bold text-cielo-800">{euro(r.totale.netto)}</p>
              <p className="text-sm text-cielo-600">netto · lordo {euro(r.totale.lordo)}</p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-cielo-700">
                <span>
                  Rata <b>{meseIt(r.rata)}</b>
                </span>
                <span>
                  Accredito <b>{dataIt(r.valuta)}</b>
                </span>
                <span>
                  <b>{r.totale.ore} h</b>
                  {r.totale.reperibilita > 0 && <> · {r.totale.reperibilita} rep.</>}
                </span>
              </div>
            </div>

            {/* stesse cifre, ma quelle davvero pagate */}
            <ConfrontoCedolino confronto={confronto} rata={r.rata} />
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

/** Le stesse cifre prese dal cedolino, con l'elenco di quello che non torna. */
function ConfrontoCedolino({ confronto, rata }: { confronto: Riconciliazione | null; rata: string }) {
  if (!confronto) {
    return (
      <div className="rounded-2xl border border-dashed border-cielo-300 bg-cielo-50/50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-cielo-500">Realmente pagato</p>
        <p className="mt-3 text-sm leading-relaxed text-cielo-600">
          Il cedolino della rata di <b>{meseIt(rata)}</b> non è ancora in archivio. Quando lo importi,
          qui compaiono le cifre vere accanto a quelle previste, con l'elenco di ciò che non quadra.
        </p>
        <Link
          to="/cedolini"
          className="mt-3 inline-block rounded-lg border border-cielo-300 px-4 py-2 text-sm font-medium text-cielo-700 transition hover:bg-cielo-50"
        >
          Importa il cedolino
        </Link>
      </div>
    )
  }

  const c = confronto.cedolino
  const problemi = confronto.righe.filter((x) => !x.ok)
  const arretrati = confronto.arretrati.reduce((a, v) => a + (v.importo ?? 0), 0)

  return (
    <div
      className={`rounded-2xl border-2 p-5 ${problemi.length ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-cielo-500">
        Realmente pagato — cedolino di {meseIt(c.rata)}
      </p>
      <p className="mt-1 text-4xl font-bold text-cielo-800">{euro(c.netto)}</p>
      <p className="text-sm text-cielo-600">
        netto · lordo {euro(c.lordo)} · accreditato il {dataIt(c.valuta)}
      </p>

      {problemi.length === 0 ? (
        <p className="mt-3 text-sm font-medium text-emerald-800">
          ✓ Tutto quadra con le ore che avevi dichiarato.
        </p>
      ) : (
        <div className="mt-3">
          <p className="text-sm font-semibold text-amber-800">Non quadra:</p>
          <ul className="mt-1 space-y-1 text-sm text-amber-900">
            {problemi.map((p) => (
              <li key={p.voce}>
                <b>{p.voce}</b>: previsti {euro(p.atteso)}, pagati {euro(p.pagato)}{' '}
                <b>({(p.delta ?? 0) > 0 ? '+' : ''}
                {euro(p.delta)})</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      {arretrati > 0 && (
        <p className="mt-2 text-xs text-cielo-600">
          Compresi {euro(arretrati)} di arretrati di mesi precedenti.
        </p>
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
