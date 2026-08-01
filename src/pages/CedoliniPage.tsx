import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { dbLocale } from '../lib/db'
import type { Cedolino, FaseImport, Riconciliazione } from '../lib/db'
import { useAuth } from '../hooks/useAuth'
import { useEscape } from '../hooks/useEscape'
import { useMese } from '../hooks/useMese'
import { useToast } from '../hooks/useToast'
import { euro, dataIt, meseIt, mesePiu } from '../lib/formato'
import DomandaSede from '../components/DomandaSede'

/** La rata di un mese paga sempre le ore del mese prima. */
function meseDeiTurni(rata: string): string {
  return mesePiu(rata, -1)
}


/** Cosa sta facendo CACCA, in parole povere, mentre l'import è in corso. */
const PAROLE_FASE: Record<FaseImport, string> = {
  lettura: 'Leggo le voci dal PDF…',
  drive: 'Salvo il PDF nella cartella DATI CACCA del tuo Drive…',
  archivio: 'Metto gli importi in archivio…',
  controllo: 'Confronto ogni voce con le ore che avevi dichiarato…',
}

/** Riquadro d'attesa: resta finché non arriva una risposta, qualunque essa sia. */
function AttesaImport({ fase }: { fase: FaseImport }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4">
      <div className="w-full max-w-sm rounded-2xl border border-cielo-200 bg-panna p-7 text-center shadow-xl">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-cielo-200 border-t-cielo-500" />
        <p className="mt-4 font-semibold text-cielo-800">Importazione in corso…</p>
        <p className="mt-1 text-sm leading-relaxed text-cielo-600">{PAROLE_FASE[fase]}</p>
      </div>
    </div>
  )
}

/** Avvisa che la rata è già in archivio e chiede se sostituirla. */
function ModaleDuplicato({ rata, onScelta }: { rata: string; onScelta: (sostituisci: boolean) => void }) {
  useEscape(() => onScelta(false))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-cielo-200 bg-panna p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-cielo-800">Cedolino già in archivio</h2>
        <p className="mt-2 text-sm leading-relaxed text-cielo-700">
          Il cedolino della rata di <b>{meseIt(rata)}</b> è già presente. Vuoi sostituirlo con il PDF
          che stai importando? I dati della rata verranno riletti da questo file.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => onScelta(false)}
            className="rounded-lg border border-cielo-300 px-4 py-2 text-sm font-medium text-cielo-700 transition hover:bg-cielo-50"
          >
            Annulla
          </button>
          <button
            onClick={() => onScelta(true)}
            className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
          >
            Sostituisci
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CedoliniPage() {
  const { utente } = useAuth()
  const toast = useToast()
  const { mese } = useMese()
  // rata chiesta dalla Home: «/cedolini?rata=2026-07»
  const [parametri] = useSearchParams()
  const rataRichiesta = parametri.get('rata')
  // I cedolini si guardano per anno: cambiando mese in alto la lista resta
  // ferma, e cambia solo quando si passa a un altro anno.
  const [anno, setAnno] = useState(() => (rataRichiesta ?? mese).slice(0, 4))
  const primoGiro = useRef(true)
  const [cedolini, setCedolini] = useState<Cedolino[]>([])
  const [aperto, setAperto] = useState<string | null>(null)
  const [dettagli, setDettagli] = useState<Record<string, Riconciliazione>>({})
  // se non è null l'import è in corso, e dice pure a che punto è
  const [fase, setFase] = useState<FaseImport | null>(null)
  // domanda in sospeso su sede/incarico ricavati da un cedolino
  const [domanda, setDomanda] = useState<{ id: string; rata: string; dati: Riconciliazione['suggerimenti'] } | null>(
    null,
  )
  // stessa rata già in archivio: si chiede se sostituirla col PDF appena scelto
  const [duplicato, setDuplicato] = useState<{ file: File; rata: string } | null>(null)

  const carica = useCallback(async () => {
    const { data } = await dbLocale.cedolini.list()
    const elenco = data ?? []
    setCedolini(elenco)
    // il controllo si fa in sottofondo per tutti: così l'esito («tutto torna» o
    // le anomalie) si vede nell'elenco senza dover aprire ogni cedolino
    void (async () => {
      for (const c of elenco) {
        const { data: esito } = await dbLocale.cedolini.riconcilia(c.id)
        if (esito) setDettagli((d) => ({ ...d, [c.id]: esito }))
      }
    })()
    return elenco
  }, [])

  // il primo anno mostrato lo decide la rata richiesta dalla Home; dopo, segue
  // il mese scelto nella barra in alto
  useEffect(() => {
    if (primoGiro.current) {
      primoGiro.current = false
      return
    }
    setAnno(mese.slice(0, 4))
  }, [mese])

  useEffect(() => {
    void carica()
  }, [carica])

  // arrivando dalla Home la voce giusta si apre da sola, anche se è di un altro
  // anno rispetto al mese scelto in alto
  useEffect(() => {
    if (!rataRichiesta) return
    setAnno(rataRichiesta.slice(0, 4))
    const c = cedolini.find((x) => x.rata === rataRichiesta)
    if (!c) return
    setAperto(c.id)
    const t = setTimeout(() => {
      document.getElementById(`cedolino-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 200)
    return () => clearTimeout(t)
  }, [rataRichiesta, cedolini])

  async function ricarica(id: string) {
    const { data, error } = await dbLocale.cedolini.riconcilia(id)
    if (error) {
      toast.errore(error.message)
      return null
    }
    if (data) setDettagli((d) => ({ ...d, [id]: data }))
    return data
  }

  async function apri(id: string) {
    if (aperto === id) {
      setAperto(null)
      return
    }
    setAperto(id)
    const dati = dettagli[id] ?? (await ricarica(id))
    // se restano domande in sospeso (sede sconosciuta, incarico nuovo) le si ripropone
    if (dati?.suggerimenti) setDomanda({ id, rata: dati.cedolino.rata, dati: dati.suggerimenti })
  }

  async function importa(file: File, sostituisci = false) {
    setFase('lettura')
    const { data, error } = await dbLocale.cedolini.importa(file, { sostituisci, onFase: setFase })
    setFase(null)
    if (error) {
      toast.errore(error.message)
      return
    }
    if (!data) return
    // la rata è già in archivio: prima di scrivere qualsiasi cosa si chiede
    if ('duplicato' in data) {
      setDuplicato({ file, rata: data.rata })
      return
    }
    await carica()
    setDettagli((d) => ({ ...d, [data.cedolino.id]: data }))
    setAperto(data.cedolino.id)
    if (data.avvisoDrive) toast.avviso(data.avvisoDrive)
    // prima di tutto: sede e incarico letti dal PDF vanno confermati
    if (data.suggerimenti) {
      setDomanda({ id: data.cedolino.id, rata: data.cedolino.rata, dati: data.suggerimenti })
    }
    if (data.anomalie > 0) {
      toast.avviso(
        `Cedolino ${meseIt(data.cedolino.rata)} importato: ${data.anomalie} ${data.anomalie === 1 ? 'anomalia trovata' : 'anomalie trovate'}! Guarda il confronto qui sotto.`,
      )
    } else {
      toast.ok(`Cedolino ${meseIt(data.cedolino.rata)} importato: tutto torna con le ore dichiarate ✓`)
    }
  }

  /** «Va bene così»: le differenze restano scritte ma non si segnalano più. */
  async function risolvi(id: string, risolte: boolean) {
    const { error } = await dbLocale.cedolini.risolviAnomalie(id, risolte)
    if (error) {
      toast.errore(error.message)
      return
    }
    await ricarica(id)
    toast.ok(risolte ? 'Anomalie archiviate: non te le segnalo più.' : 'Anomalie di nuovo attive.')
  }

  const dellAnno = cedolini.filter((c) => c.rata.slice(0, 4) === anno)
  const anniConCedolini = Array.from(new Set(cedolini.map((c) => c.rata.slice(0, 4)))).sort()

  async function elimina(c: Cedolino) {
    if (!window.confirm(`Eliminare il cedolino della rata ${meseIt(c.rata)} dall'archivio?`)) return
    const { error } = await dbLocale.cedolini.elimina(c.id)
    if (error) {
      toast.errore(error.message)
      return
    }
    toast.ok('Cedolino eliminato.')
    await carica()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {fase && <AttesaImport fase={fase} />}

      {domanda?.dati && (
        <DomandaSede
          suggerimenti={domanda.dati}
          rata={domanda.rata}
          onFine={(aggiornato) => {
            const id = domanda.id
            setDomanda(null)
            if (aggiornato) void ricarica(id)
          }}
        />
      )}

      {duplicato && (
        <ModaleDuplicato
          rata={duplicato.rata}
          onScelta={(sostituisci) => {
            const file = duplicato.file
            setDuplicato(null)
            if (sostituisci) void importa(file, true)
            else toast.avviso('Importazione annullata: il cedolino già in archivio resta com’era.')
          }}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-cielo-800">Cedolini {anno}</h1>
        <label
          className={`cursor-pointer rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 ${fase ? 'pointer-events-none opacity-50' : ''}`}
        >
          {fase ? 'Importazione…' : '⬆ Importa cedolino PDF'}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importa(file)
            }}
          />
        </label>
      </div>

      <p className="text-sm text-cielo-600">
        Carica il PDF NoiPA appena arriva: CACCA legge le voci, archivia il file nella cartella dati e
        confronta ogni importo con le ore che avevi dichiarato. Le differenze saltano fuori da sole.
        L'elenco mostra le rate del {anno}: per vedere un altro anno cambia anno con le frecce in alto.
      </p>

      {cedolini.length === 0 ? (
        <p className="rounded-2xl border border-cielo-200 bg-panna p-6 text-center text-sm text-cielo-600">
          Nessun cedolino in archivio. Importa il primo con il pulsante qui sopra.
        </p>
      ) : (
        dellAnno.length === 0 && (
          <p className="rounded-2xl border border-cielo-200 bg-panna p-6 text-center text-sm text-cielo-600">
            Nessun cedolino del {anno} in archivio.
            {anniConCedolini.length > 0 && (
              <> Ne hai per: <b>{anniConCedolini.join(', ')}</b>.</>
            )}
          </p>
        )
      )}

      <div className="space-y-3">
        {dellAnno.map((c) => {
          const det = dettagli[c.id]
          return (
            <section key={c.id} id={`cedolino-${c.id}`} className="overflow-hidden rounded-2xl border border-cielo-200 bg-panna">
              <button onClick={() => void apri(c.id)} className="flex w-full flex-wrap items-center gap-4 px-5 py-3 text-left">
                <span className="min-w-32 text-lg font-semibold text-cielo-800">{meseIt(c.rata)}</span>
                <span className="rounded-full bg-cielo-50 px-2.5 py-0.5 text-xs font-medium text-cielo-600">
                  Turni di {meseIt(meseDeiTurni(c.rata))}
                </span>
                <span className="text-sm text-cielo-600">
                  lordo <b className="text-cielo-800">{euro(c.lordo)}</b>
                </span>
                <span className="text-sm text-cielo-600">
                  netto <b className="text-cielo-800">{euro(c.netto)}</b>
                </span>
                <span className="text-sm text-cielo-600">valuta {dataIt(c.valuta)}</span>
                {!det && (
                  <span className="rounded-full bg-cielo-50 px-2.5 py-0.5 text-xs text-cielo-400">controllo…</span>
                )}
                {det &&
                  (det.anomalieAperte > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      ⚠ {det.anomalieAperte} {det.anomalieAperte === 1 ? 'anomalia' : 'anomalie'}
                    </span>
                  ) : det.anomalie > 0 ? (
                    <span className="rounded-full bg-cielo-100 px-2.5 py-0.5 text-xs font-semibold text-cielo-600">
                      ✓ differenze sistemate
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      ✓ tutto torna
                    </span>
                  ))}
                <span className="ml-auto text-cielo-400">{aperto === c.id ? '▲' : '▼'}</span>
              </button>

              {aperto === c.id && (
                <div className="border-t border-cielo-200 px-5 py-4">
                  {!det ? (
                    <p className="text-sm text-cielo-500">Confronto in corso…</p>
                  ) : (
                    <>
                      <p className="text-sm text-cielo-600">
                        Confronto con le ore di <b>{det.etichettaMese}</b> ({det.atteso.totale.ore}h,{' '}
                        {det.atteso.totale.reperibilita} reperibilità
                        {det.atteso.totale.oreSuperfestive > 0 && `, ★ ${det.atteso.totale.oreSuperfestive}h superfestive`}
                        ).
                      </p>
                      <p className="mt-1 text-xs text-cielo-500">
                        Letti dal PDF: sede <b>{c.sede ?? '—'}</b> · iscrizione <b>{c.iscrizione ?? '—'}</b>
                        {det.suggerimenti && (
                          <button
                            onClick={() => setDomanda({ id: c.id, rata: c.rata, dati: det.suggerimenti })}
                            className="ml-2 font-medium text-cielo-600 underline"
                          >
                            da confermare
                          </button>
                        )}
                      </p>
                      <table className="mt-3 w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-cielo-500">
                            <th className="py-1">Voce</th>
                            <th className="py-1 text-right">Atteso</th>
                            <th className="py-1 text-right">Pagato</th>
                            <th className="py-1 text-right">Differenza</th>
                            <th className="py-1 pl-3">Esito</th>
                          </tr>
                        </thead>
                        <tbody>
                          {det.righe.map((r) => (
                            <tr key={r.voce} className={`border-t border-cielo-100 ${r.ok ? '' : 'bg-amber-50'}`}>
                              <td className="py-1.5 pr-2 text-cielo-800">{r.voce}</td>
                              <td className="py-1.5 text-right text-cielo-700">{r.atteso === null ? '—' : euro(r.atteso)}</td>
                              <td className="py-1.5 text-right text-cielo-700">{euro(r.pagato)}</td>
                              <td className={`py-1.5 text-right font-medium ${!r.ok ? 'text-amber-700' : 'text-cielo-500'}`}>
                                {r.delta === null || Math.abs(r.delta) < 0.005 ? '—' : euro(r.delta)}
                              </td>
                              <td className="py-1.5 pl-3 text-xs">
                                {r.ok ? (
                                  <span className="text-emerald-700">✓</span>
                                ) : det.anomalieRisolte ? (
                                  <span className="text-cielo-500">sistemata</span>
                                ) : (
                                  <span className="font-semibold text-amber-700">⚠ da segnalare</span>
                                )}
                                {r.testo && <span className="ml-1 text-cielo-500">{r.testo}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {det.arretrati.length > 0 && (
                        <p className="mt-3 rounded-lg bg-cielo-50 px-3 py-2 text-xs text-cielo-700">
                          In questa rata sono arrivati anche arretrati di mesi precedenti:{' '}
                          {det.arretrati
                            .map((v) => `${v.descrizione ?? v.codice} (Rif ${v.rif}) ${euro(v.importo)}`)
                            .join(' · ')}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {det.anomalie > 0 &&
                          (det.anomalieRisolte ? (
                            <button
                              onClick={() => void risolvi(c.id, false)}
                              className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-50"
                            >
                              Segnala di nuovo queste anomalie
                            </button>
                          ) : (
                            <button
                              onClick={() => void risolvi(c.id, true)}
                              title="Le differenze restano scritte qui, ma il programma smette di segnalarle"
                              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600"
                            >
                              ✓ Risolvi anomalie
                            </button>
                          ))}
                        <button
                          onClick={() => void dbLocale.cedolini.apri(c.id).then(({ error }) => error && toast.errore(error.message))}
                          className="rounded-lg border border-cielo-300 px-3 py-1.5 text-sm text-cielo-700 transition hover:bg-cielo-50"
                        >
                          Apri il PDF
                        </button>
                        {utente?.ruolo === 'admin' && (
                          <button
                            onClick={() => void elimina(c)}
                            className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50"
                          >
                            Elimina dall'archivio
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
