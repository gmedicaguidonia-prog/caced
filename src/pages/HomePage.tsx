import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dbLocale } from '../lib/db'
import type { Cedolino, RaccoltaMese, Riconciliazione } from '../lib/db'
import { euro, dataIt, meseIt, meseOggi, mesePiu } from '../lib/formato'

export default function HomePage() {
  const [mese, setMese] = useState<string | null>(null)
  const [raccolta, setRaccolta] = useState<RaccoltaMese | null>(null)
  const [precedente, setPrecedente] = useState<RaccoltaMese | null>(null)
  const [cedolini, setCedolini] = useState<Cedolino[]>([])
  const [allarmi, setAllarmi] = useState<{ rata: string; righe: Riconciliazione['righe'] }[]>([])
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    let vivo = true
    async function carica() {
      const { data: mesi } = await dbLocale.calcoli.mesiDisponibili()
      const corrente = meseOggi()
      const scelto = mesi && mesi.length ? (mesi.includes(corrente) ? corrente : mesi[mesi.length - 1]) : corrente
      const [{ data: r }, { data: rPrec }, { data: ced }] = await Promise.all([
        dbLocale.calcoli.mese(scelto),
        dbLocale.calcoli.mese(mesePiu(scelto, -1)),
        dbLocale.cedolini.list(),
      ])
      if (!vivo) return
      setMese(scelto)
      setRaccolta(r)
      setPrecedente(rPrec)
      setCedolini(ced ?? [])

      // controllo automatico di TUTTI i cedolini archiviati
      const problemi: { rata: string; righe: Riconciliazione['righe'] }[] = []
      for (const c of ced ?? []) {
        const { data: esito } = await dbLocale.cedolini.riconcilia(c.id)
        if (esito && esito.anomalie > 0) {
          problemi.push({ rata: c.rata, righe: esito.righe.filter((x) => !x.ok) })
        }
      }
      if (!vivo) return
      problemi.sort((a, b) => (a.rata < b.rata ? -1 : 1))
      setAllarmi(problemi)
      setPronto(true)
    }
    void carica()
    return () => {
      vivo = false
    }
  }, [])

  const mancante = allarmi.reduce(
    (acc, a) => acc + a.righe.reduce((s, r) => s + Math.max(0, -(r.delta ?? 0)), 0),
    0,
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-cielo-800">Benvenuto 💩</h1>

      {/* ---- allarme anomalie sui cedolini ---- */}
      {pronto && allarmi.length > 0 && (
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5">
          <p className="font-semibold text-red-800">
            ⚠ Il controllo dei cedolini ha trovato {allarmi.length}{' '}
            {allarmi.length === 1 ? 'rata con anomalie' : 'rate con anomalie'} — mancano circa{' '}
            {euro(mancante)} lordi
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-700">
            {allarmi.map((a) => (
              <li key={a.rata}>
                <b>Rata {meseIt(a.rata)}:</b>{' '}
                {a.righe.map((r) => `${r.voce} (${euro(r.delta ?? 0)})`).join(' · ')}
              </li>
            ))}
          </ul>
          <Link
            to="/cedolini"
            className="mt-3 inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            Vai ai cedolini per i dettagli
          </Link>
        </div>
      )}
      {pronto && allarmi.length === 0 && cedolini.length > 0 && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
          ✓ Tutti i cedolini archiviati tornano con le ore dichiarate: nessuna anomalia.
        </div>
      )}

      {/* ---- mese in corso ---- */}
      {raccolta && (
        <div className="rounded-2xl border border-cielo-200 bg-panna p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-cielo-800">
              Ore di {meseIt(mese)} <span className="text-sm font-normal text-cielo-500">(in pagamento nella rata {meseIt(raccolta.rata)})</span>
            </h2>
            <Link to="/turni" className="text-sm font-medium text-cielo-600 hover:underline">
              apri il registro turni →
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {raccolta.postazioni.map((p) => (
              <div key={p.postazione.id} className="rounded-xl border border-cielo-200 bg-white p-4">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-cielo-500" title={p.postazione.nome}>
                  {p.postazione.nome}
                </p>
                <p className="mt-1 text-2xl font-bold text-cielo-800">{p.calcolo.ore} h</p>
                <p className="text-xs text-cielo-600">
                  {p.calcolo.turni} turni · {p.calcolo.reperibilita} reperibilità
                  {p.calcolo.oreSuperfestive > 0 && ` · ★ ${p.calcolo.oreSuperfestive}h superfestive`}
                </p>
              </div>
            ))}
            <div className="rounded-xl border border-cielo-300 bg-cielo-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-cielo-500">Totale previsto</p>
              <p className="mt-1 text-2xl font-bold text-cielo-800">{euro(raccolta.totale.netto)}</p>
              <p className="text-xs text-cielo-600">
                netto stimato · valuta {dataIt(raccolta.valuta)}
                {raccolta.benzina.stimato && ' · benzina stimata'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---- rata in arrivo (mese precedente) ---- */}
      {precedente && precedente.totale.ore > 0 && (
        <div className="rounded-2xl border border-cielo-200 bg-panna p-5">
          <h2 className="text-lg font-semibold text-cielo-800">
            Rata in arrivo: {meseIt(precedente.rata)}
          </h2>
          <p className="mt-1 text-sm text-cielo-600">
            Per le {precedente.totale.ore} ore di {meseIt(precedente.mese)}
            {precedente.totale.reperibilita > 0 && ` e ${precedente.totale.reperibilita} reperibilità`}.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-cielo-500">Netto previsto</p>
              <p className="text-3xl font-bold text-cielo-800">{euro(precedente.totale.netto)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-cielo-500">Lordo</p>
              <p className="text-xl font-semibold text-cielo-700">{euro(precedente.totale.lordo)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-cielo-500">Accredito previsto</p>
              <p className="text-xl font-semibold text-cielo-700">{dataIt(precedente.valuta)}</p>
            </div>
            <Link
              to="/previsione"
              className="ml-auto rounded-lg border border-cielo-300 px-4 py-2 text-sm font-medium text-cielo-700 transition hover:bg-cielo-50"
            >
              Vedi il calcolo completo
            </Link>
          </div>
          {precedente.benzina.stimato && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Il compenso chilometrico è stimato con l'ultimo prezzo benzina noto
              {precedente.benzina.da ? ` (${meseIt(precedente.benzina.da)})` : ''}: il valore esatto si
              saprà dal cedolino.
            </p>
          )}
        </div>
      )}

      {/* ---- promemoria excel ---- */}
      <div className="rounded-2xl border border-cielo-200 bg-panna p-5">
        <h2 className="text-lg font-semibold text-cielo-800">Da fare a fine mese</h2>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-cielo-700">
          <li>
            Compila i turni nel <Link to="/turni" className="font-medium text-cielo-600 hover:underline">Registro Turni</Link>.
          </li>
          <li>
            Genera i <Link to="/riepiloghi" className="font-medium text-cielo-600 hover:underline">riepiloghi excel</Link> (uno per postazione) e mandali all'ufficio.
          </li>
          <li>
            Quando arriva il cedolino, <Link to="/cedolini" className="font-medium text-cielo-600 hover:underline">importalo</Link>: CACCA lo controlla da sola, voce per voce.
          </li>
        </ol>
      </div>
    </div>
  )
}
