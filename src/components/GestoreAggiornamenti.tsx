import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { dbLocale } from '../lib/db'
import type { StatoAggiornamento } from '../lib/db'

// Permette al resto dell'app (es. il numero di versione nell'intestazione) di
// chiedere un controllo immediato e di sapere com'è andato.
type ContestoAgg = {
  stato: StatoAggiornamento
  controlloManuale: 'fermo' | 'incorso' | 'aggiornato'
  controllaOra: () => Promise<void>
}
const AggCtx = createContext<ContestoAgg | undefined>(undefined)

export function useAggiornamenti(): ContestoAgg {
  const c = useContext(AggCtx)
  if (!c) throw new Error('useAggiornamenti va usato dentro <GestoreAggiornamenti>')
  return c
}

const LOGO = './logo.svg'
// Oltre questo tempo si entra comunque nel programma: se GitHub non risponde,
// il lavoro non deve mai restare bloccato.
const ATTESA_MASSIMA_CONTROLLO = 10000

const STATO_INIZIALE: StatoAggiornamento = {
  supportato: false,
  versioneCorrente: '',
  fase: 'inattivo',
  percentuale: 0,
  disponibile: null,
  messaggio: '',
}

/**
 * All'avvio controlla e, se serve, installa l'aggiornamento PRIMA di ogni altra
 * cosa. Dopo l'avvio, se ne esce uno nuovo, mostra il banner arancione.
 */
export default function GestoreAggiornamenti({ children }: { children: ReactNode }) {
  const [stato, setStato] = useState<StatoAggiornamento>(STATO_INIZIALE)
  const [avvioConcluso, setAvvioConcluso] = useState(false)
  const [rimandato, setRimandato] = useState(false)
  const [erroreAvvio, setErroreAvvio] = useState<string | null>(null)
  const [controlloManuale, setControlloManuale] = useState<'fermo' | 'incorso' | 'aggiornato'>('fermo')

  /** Controllo su richiesta (dal numero di versione nell'intestazione). */
  async function controllaOra() {
    setControlloManuale('incorso')
    setRimandato(false)
    const esito = await dbLocale.aggiornamenti.controlla().catch(() => null)
    const trovato = (esito as { data?: { versione?: string } | null } | null)?.data ?? null
    setControlloManuale(trovato?.versione ? 'fermo' : 'aggiornato')
    if (!trovato?.versione) window.setTimeout(() => setControlloManuale('fermo'), 4000)
  }

  // resta in ascolto dei cambi di stato (controllo, avanzamento, errori)
  useEffect(() => dbLocale.aggiornamenti.osserva(setStato), [])

  // sequenza di avvio: controlla → se c'è, installa subito.
  // Qualunque cosa vada storta, si entra comunque nel programma.
  useEffect(() => {
    let vivo = true
    let installazioneAvviata = false

    const salvagente = window.setTimeout(() => {
      if (vivo && !installazioneAvviata) setAvvioConcluso(true)
    }, ATTESA_MASSIMA_CONTROLLO + 5000)

    async function avvio() {
      try {
        console.log('[CACCA] avvio: ponte ' + (window.cacca ? 'presente' : 'ASSENTE'))
        const { data } = await dbLocale.aggiornamenti.stato()
        if (data) setStato(data)
        if (!data?.supportato) return

        const controllo = dbLocale.aggiornamenti.controlla().catch(() => null)
        const scaduto = new Promise<null>((r) => setTimeout(() => r(null), ATTESA_MASSIMA_CONTROLLO))
        const esito = await Promise.race([controllo, scaduto])
        if (!vivo) return

        const trovato =
          (esito as { data?: { versione?: string; autoInstalla?: boolean } | null } | null)?.data ?? null
        if (!trovato?.versione) return

        if (trovato.autoInstalla === false) {
          setErroreAvvio(
            `L'aggiornamento alla versione ${trovato.versione} non è andato a buon fine nei tentativi precedenti. ` +
              'Puoi riprovare dal pulsante "Aggiorna subito".',
          )
          return
        }

        installazioneAvviata = true
        const inst = await dbLocale.aggiornamenti.installa().catch((e: unknown) => ({
          data: null,
          error: { message: String(e) },
        }))
        if (!vivo) return
        if (inst?.error) {
          installazioneAvviata = false
          setErroreAvvio(inst.error.message)
        }
      } catch (e) {
        if (vivo) setErroreAvvio(String(e))
      } finally {
        if (vivo && !installazioneAvviata) setAvvioConcluso(true)
      }
    }

    void avvio()
    return () => {
      vivo = false
      window.clearTimeout(salvagente)
    }
  }, [])

  const inCorso = stato.fase === 'download' || stato.fase === 'installazione'

  // --- schermata di avvio: nulla è accessibile finché non si conclude ---
  if (!avvioConcluso) {
    return inCorso ? (
      <PannelloAggiornamento stato={stato} />
    ) : (
      <div className="flex h-screen flex-col items-center justify-center bg-cielo-100 p-6 text-center">
        <img src={LOGO} alt="CACCA" className="h-28 w-28" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-cielo-800">CACCA</h1>
        <p className="mt-4 text-cielo-600">Controllo aggiornamenti…</p>
      </div>
    )
  }

  return (
    <AggCtx.Provider value={{ stato, controlloManuale, controllaOra }}>
      {erroreAvvio && (
        <div className="fixed inset-x-0 top-0 z-50 flex justify-center p-2">
          <div className="flex items-center gap-3 rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-800 shadow">
            Aggiornamento non riuscito: {erroreAvvio}
            <button onClick={() => setErroreAvvio(null)} className="font-medium underline">
              chiudi
            </button>
          </div>
        </div>
      )}

      {children}

      {stato.fase === 'disponibile' && !rimandato && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
          <div className="flex max-w-2xl flex-wrap items-center gap-4 rounded-xl bg-amber-500 px-5 py-3 text-white shadow-lg">
            <span className="flex items-center gap-2 text-sm font-medium">
              <IconaAggiornamento />
              È disponibile l'aggiornamento {stato.disponibile?.versione}
            </span>
            <span className="flex gap-2">
              <button
                onClick={() => void dbLocale.aggiornamenti.installa()}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
              >
                Aggiorna subito
              </button>
              <button
                onClick={() => setRimandato(true)}
                title="Verrà installato automaticamente alla prossima apertura"
                className="rounded-lg border border-white/60 px-3 py-1.5 text-sm text-white transition hover:bg-amber-600"
              >
                Più tardi
              </button>
            </span>
          </div>
        </div>
      )}

      {inCorso && <PannelloAggiornamento stato={stato} />}
    </AggCtx.Provider>
  )
}

function PannelloAggiornamento({ stato }: { stato: StatoAggiornamento }) {
  const scaricando = stato.fase === 'download'
  return (
    <div
      className="fixed inset-0 z-[100] flex cursor-wait items-center justify-center bg-cielo-100 p-6"
      onClickCapture={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      role="alertdialog"
      aria-busy="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-cielo-200 bg-panna p-8 text-center shadow-xl">
        <img src={LOGO} alt="" className="mx-auto h-24 w-24" />
        <h2 className="mt-4 text-xl font-bold tracking-tight text-cielo-800">Aggiornamento in corso</h2>
        <p className="mt-2 text-sm text-cielo-700">
          {scaricando
            ? `Scaricamento della versione ${stato.disponibile?.versione ?? ''}…`
            : 'Installazione della nuova versione…'}
        </p>

        <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-cielo-200">
          <div
            className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
            style={{ width: `${Math.max(4, stato.percentuale)}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-medium text-cielo-600">{stato.percentuale}%</p>

        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
          <b>Non chiudere l'app manualmente.</b> Al termine dell'aggiornamento si riavvierà da sola e vedrai il
          numero della nuova versione in alto a destra.
        </p>
      </div>
    </div>
  )
}

function IconaAggiornamento() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}
