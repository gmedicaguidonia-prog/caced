import { useCallback, useEffect, useState } from 'react'
import { dbLocale } from '../lib/db'
import type { Cedolino, Riconciliazione } from '../lib/db'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { euro, dataIt, meseIt } from '../lib/formato'
import DomandaSede from '../components/DomandaSede'

export default function CedoliniPage() {
  const { utente } = useAuth()
  const toast = useToast()
  const [cedolini, setCedolini] = useState<Cedolino[]>([])
  const [aperto, setAperto] = useState<string | null>(null)
  const [dettagli, setDettagli] = useState<Record<string, Riconciliazione>>({})
  const [importo, setImporto] = useState(false)
  // domanda in sospeso su sede/incarico ricavati da un cedolino
  const [domanda, setDomanda] = useState<{ id: string; rata: string; dati: Riconciliazione['suggerimenti'] } | null>(
    null,
  )

  const carica = useCallback(async () => {
    const { data } = await dbLocale.cedolini.list()
    const elenco = data ?? []
    setCedolini(elenco)
    // il controllo si fa subito per tutti: così l'esito («tutto torna» o le
    // anomalie) si vede nell'elenco senza dover aprire ogni cedolino
    for (const c of elenco) {
      const { data: esito } = await dbLocale.cedolini.riconcilia(c.id)
      if (esito) setDettagli((d) => ({ ...d, [c.id]: esito }))
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

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

  async function importa(file: File) {
    setImporto(true)
    const { data, error } = await dbLocale.cedolini.importa(file)
    setImporto(false)
    if (error) {
      toast.errore(error.message)
      return
    }
    if (!data) return
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-cielo-800">Cedolini</h1>
        <label
          className={`cursor-pointer rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 ${importo ? 'pointer-events-none opacity-50' : ''}`}
        >
          {importo ? 'Importazione…' : '⬆ Importa cedolino PDF'}
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
      </p>

      {cedolini.length === 0 && (
        <p className="rounded-2xl border border-cielo-200 bg-panna p-6 text-center text-sm text-cielo-600">
          Nessun cedolino in archivio. Importa il primo con il pulsante qui sopra.
        </p>
      )}

      <div className="space-y-3">
        {cedolini.map((c) => {
          const det = dettagli[c.id]
          return (
            <section key={c.id} className="overflow-hidden rounded-2xl border border-cielo-200 bg-panna">
              <button onClick={() => void apri(c.id)} className="flex w-full flex-wrap items-center gap-4 px-5 py-3 text-left">
                <span className="min-w-32 text-lg font-semibold text-cielo-800">{meseIt(c.rata)}</span>
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
