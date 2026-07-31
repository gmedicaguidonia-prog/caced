import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dbLocale } from '../lib/db'
import type { Cedolino, RaccoltaMese, Riconciliazione } from '../lib/db'
import { useMese } from '../hooks/useMese'
import { euro, dataIt, meseIt, mesePiu } from '../lib/formato'

export default function HomePage() {
  const { mese } = useMese()
  const [raccolta, setRaccolta] = useState<RaccoltaMese | null>(null)
  const [precedente, setPrecedente] = useState<RaccoltaMese | null>(null)
  const [cedolini, setCedolini] = useState<Cedolino[]>([])
  /** esito del controllo di ogni cedolino, per rata: serve alle spie di stato */
  const [esiti, setEsiti] = useState<Record<string, Riconciliazione>>({})
  const [allarmi, setAllarmi] = useState<{ rata: string; righe: Riconciliazione['righe'] }[]>([])
  const [pronto, setPronto] = useState(false)
  /** true appena esiste almeno un turno o una reperibilità in archivio */
  const [haDati, setHaDati] = useState(true)

  useEffect(() => {
    let vivo = true
    async function carica() {
      const { data: mesi } = await dbLocale.calcoli.mesiDisponibili()
      if (vivo) setHaDati((mesi ?? []).length > 0)
      const [{ data: r }, { data: rPrec }, { data: ced }] = await Promise.all([
        dbLocale.calcoli.mese(mese),
        dbLocale.calcoli.mese(mesePiu(mese, -1)),
        dbLocale.cedolini.list(),
      ])
      if (!vivo) return
      setRaccolta(r)
      setPrecedente(rPrec)
      setCedolini(ced ?? [])

      // controllo automatico di TUTTI i cedolini archiviati
      const problemi: { rata: string; righe: Riconciliazione['righe'] }[] = []
      const perRata: Record<string, Riconciliazione> = {}
      for (const c of ced ?? []) {
        const { data: esito } = await dbLocale.cedolini.riconcilia(c.id)
        if (esito) perRata[c.rata] = esito
        // quelle già archiviate come «va bene così» non si segnalano più
        if (esito && esito.anomalieAperte > 0) {
          problemi.push({ rata: c.rata, righe: esito.righe.filter((x) => !x.ok) })
        }
      }
      if (!vivo) return
      setEsiti(perRata)
      problemi.sort((a, b) => (a.rata < b.rata ? -1 : 1))
      setAllarmi(problemi)
      setPronto(true)
    }
    void carica()
    return () => {
      vivo = false
    }
  }, [mese])

  const mancante = allarmi.reduce(
    (acc, a) => acc + a.righe.reduce((s, r) => s + Math.max(0, -(r.delta ?? 0)), 0),
    0,
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-cielo-800">Benvenuto 💩</h1>

      {/* ---- allarme anomalie sui cedolini ---- */}
      {pronto && allarmi.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <p className="font-semibold text-amber-800">
            ⚠ Il controllo dei cedolini ha trovato {allarmi.length}{' '}
            {allarmi.length === 1 ? 'rata con anomalie' : 'rate con anomalie'} — mancano circa{' '}
            {euro(mancante)} lordi
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {allarmi.map((a) => (
              <li key={a.rata}>
                <b>Rata {meseIt(a.rata)}:</b>{' '}
                {a.righe.map((r) => `${r.voce} (${euro(r.delta ?? 0)})`).join(' · ')}
              </li>
            ))}
          </ul>
          <Link
            to="/cedolini"
            className="mt-3 inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
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

      {/* ---- nessun dato: si spiega da dove si comincia ---- */}
      {pronto && !haDati && (
        <div className="rounded-2xl border border-cielo-200 bg-panna p-8 text-center">
          <p className="text-lg font-semibold text-cielo-800">Non hai ancora inserito nessun turno</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-cielo-600">
            Comincia dal registro: segna i turni del mese e CACCA calcolerà da sola compensi, riepiloghi per
            l'ufficio e controlli sui cedolini. Se hai già un cedolino, puoi anche importarlo subito: da lì
            ricavo la postazione e il numero di iscrizione.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              to="/turni"
              className="rounded-lg bg-cielo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-cielo-600"
            >
              Vai al Registro Turni
            </Link>
            <Link
              to="/cedolini"
              className="rounded-lg border border-cielo-300 px-5 py-2.5 text-sm font-medium text-cielo-700 transition hover:bg-cielo-50"
            >
              Importa un cedolino
            </Link>
          </div>
        </div>
      )}

      {/* ---- mese in corso (solo se c'è qualcosa) ---- */}
      {raccolta && (raccolta.totale.ore > 0 || raccolta.totale.reperibilita > 0) && (
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
            {raccolta.postazioni
              .filter((p) => p.calcolo.ore > 0 || p.calcolo.reperibilita > 0)
              .map((p) => (
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
            <Link
              to={`/cedolini?rata=${raccolta.rata}`}
              title="Apri l'archivio cedolini sulla rata di questo mese"
              className="block rounded-xl border border-cielo-300 bg-cielo-50 p-4 transition hover:border-cielo-400 hover:bg-cielo-100"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-cielo-500">Totale previsto</p>
              <p className="mt-1 text-2xl font-bold text-cielo-800">{euro(raccolta.totale.netto)}</p>
              <p className="text-xs text-cielo-600">
                netto stimato · valuta {dataIt(raccolta.valuta)}
                {raccolta.benzina.stimato && ' · benzina stimata'}
              </p>
              {(() => {
                const ced = cedolini.find((c) => c.rata === raccolta.rata)
                if (!ced)
                  return <p className="mt-1.5 text-xs font-medium text-cielo-500">⏳ In attesa del cedolino per conferma</p>
                const esito = esiti[raccolta.rata]
                if (!esito) return <p className="mt-1.5 text-xs text-cielo-400">controllo del cedolino…</p>
                if (esito.anomalieAperte > 0)
                  return <p className="mt-1.5 text-xs font-semibold text-amber-700">⚠ Anomalie nel conteggio col cedolino</p>
                return <p className="mt-1.5 text-xs font-semibold text-emerald-700">✓ Confermato con cedolino</p>
              })()}
            </Link>
          </div>
        </div>
      )}

      {/* ---- rata in arrivo (mese precedente) o già accreditata se il cedolino c'è ---- */}
      {precedente && precedente.totale.ore > 0 && (() => {
        const cedRata = cedolini.find((c) => c.rata === precedente.rata)
        const nettoCombacia =
          cedRata != null && cedRata.netto != null && Math.abs(cedRata.netto - precedente.totale.netto) < 0.005
        return (
          <div className="rounded-2xl border border-cielo-200 bg-panna p-5">
            <h2 className="text-lg font-semibold text-cielo-800">
              {cedRata ? 'Rata accreditata' : 'Rata in arrivo'}: {meseIt(precedente.rata)}
            </h2>
            <p className="mt-1 text-sm text-cielo-600">
              Per le {precedente.totale.ore} ore di {meseIt(precedente.mese)}
              {precedente.totale.reperibilita > 0 && ` e ${precedente.totale.reperibilita} reperibilità`}
              {cedRata ? ' — cifre lette dal cedolino.' : '.'}
            </p>
            {cedRata ? (
              <div className="mt-3 flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wide text-cielo-500">Netto accreditato</p>
                  <p className={`text-3xl font-bold ${nettoCombacia ? 'text-emerald-600' : 'text-red-600'}`}>
                    {euro(cedRata.netto)}
                  </p>
                  {!nettoCombacia && (
                    <p className="text-xs text-cielo-500">previsto {euro(precedente.totale.netto)}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-cielo-500">Lordo</p>
                  <p className="text-xl font-semibold text-cielo-700">{euro(cedRata.lordo)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-cielo-500">Accreditata il</p>
                  <p className="text-xl font-semibold text-cielo-700">{dataIt(cedRata.valuta)}</p>
                </div>
                <Link
                  to={`/cedolini?rata=${precedente.rata}`}
                  className="ml-auto rounded-lg border border-cielo-300 px-4 py-2 text-sm font-medium text-cielo-700 transition hover:bg-cielo-50"
                >
                  Apri il cedolino
                </Link>
              </div>
            ) : (
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
            )}
            {!cedRata && precedente.benzina.stimato && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Il compenso chilometrico è stimato con l'ultimo prezzo benzina noto
                {precedente.benzina.da ? ` (${meseIt(precedente.benzina.da)})` : ''}: il valore esatto si
                saprà dal cedolino.
              </p>
            )}
          </div>
        )
      })()}

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
