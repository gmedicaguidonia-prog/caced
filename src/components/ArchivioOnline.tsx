import { useCallback, useEffect, useState } from 'react'
import { dbLocale } from '../lib/db'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useEscape } from '../hooks/useEscape'

const inputCls =
  'w-full rounded-lg border border-cielo-300 bg-white px-3 py-2 text-sm text-cielo-800 outline-none transition focus:border-cielo-400'

type Stato = {
  attivo: boolean
  email?: string
  ultimoInvio?: string | null
  sbloccato: boolean
  indirizzo: string
}

/**
 * «Voglio ritrovare i miei dati anche da un altro computer».
 * I dati vengono cifrati QUI con una chiave che nasce dalla password e poi
 * depositati online: il server conserva soltanto byte illeggibili.
 */
export default function ArchivioOnline() {
  const { utente } = useAuth()
  const toast = useToast()
  const [stato, setStato] = useState<Stato | null>(null)
  const [passo, setPasso] = useState<'chiuso' | 'spiegazione' | 'password' | 'scelta' | 'lavoro'>('chiuso')
  const [password, setPassword] = useState('')
  const [ripeti, setRipeti] = useState('')
  const [esistente, setEsistente] = useState<{ dispositivo?: string; byte?: number; aggiornatoIl?: string } | null>(
    null,
  )
  const [errore, setErrore] = useState<string | null>(null)

  const carica = useCallback(async () => {
    const { data } = await dbLocale.online.stato()
    if (data) setStato(data as Stato)
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  useEscape(() => passo !== 'lavoro' && chiudi())

  function chiudi() {
    setPasso('chiuso')
    setPassword('')
    setRipeti('')
    setErrore(null)
    setEsistente(null)
  }

  /** Dopo la password: si guarda se online c'è già qualcosa per questo indirizzo. */
  async function proseguiConPassword() {
    setErrore(null)
    if (password.length < 8) {
      setErrore('Serve la password del tuo accesso (almeno 8 caratteri): da lì nasce la chiave di cifratura.')
      return
    }
    if (ripeti && password !== ripeti) {
      setErrore('Le due password non coincidono.')
      return
    }
    setPasso('lavoro')
    const { data, error } = await dbLocale.online.controlla(utente?.email ?? '')
    if (error) {
      setPasso('password')
      setErrore(error.message)
      return
    }
    if (data?.esiste) {
      setEsistente(data)
      setPasso('scelta')
      return
    }
    await attiva('carica')
  }

  async function attiva(modo: 'carica' | 'scarica') {
    setPasso('lavoro')
    setErrore(null)
    const { error } = await dbLocale.online.attiva({ email: utente?.email ?? '', password, modo })
    if (error) {
      setPasso(esistente ? 'scelta' : 'password')
      setErrore(error.message)
      return
    }
    await carica()
    chiudi()
    toast.ok(
      modo === 'scarica'
        ? 'Archivio online collegato: i dati online sono ora anche su questo computer.'
        : 'Archivio online attivo: i tuoi dati sono cifrati e depositati online.',
    )
  }

  async function inviaOra() {
    const { error } = await dbLocale.online.invia()
    if (error) {
      toast.errore(error.message)
      return
    }
    await carica()
    toast.ok('Archivio online aggiornato.')
  }

  async function sblocca() {
    const pwd = window.prompt('Password del tuo accesso (serve per aprire l\'archivio online):')
    if (!pwd) return
    const { error } = await dbLocale.online.sblocca(pwd)
    if (error) {
      toast.errore(error.message)
      return
    }
    await carica()
    toast.ok('Archivio online sbloccato e riportato su questo computer.')
  }

  async function disattiva() {
    const cancella = window.confirm(
      'Vuoi anche CANCELLARE la copia online?\n\n' +
        'OK = cancella tutto dal server (i dati restano su questo computer)\n' +
        'Annulla = smetti solo di sincronizzare, la copia online resta',
    )
    const { error } = await dbLocale.online.disattiva(cancella)
    if (error) {
      toast.errore(error.message)
      return
    }
    await carica()
    toast.ok(cancella ? 'Archivio online cancellato dal server.' : 'Sincronizzazione online sospesa.')
  }

  if (!stato) return null

  return (
    <section className="rounded-2xl border border-cielo-200 bg-panna p-5">
      <h2 className="text-lg font-semibold text-cielo-800">Archivio online (facoltativo)</h2>

      {!stato.attivo ? (
        <>
          <p className="mt-1 text-sm leading-relaxed text-cielo-600">
            Oggi i tuoi dati vivono <b>solo su questo computer</b>. Se vuoi ritrovarli anche altrove (un
            secondo PC, o dopo aver cambiato macchina), CACCA può tenerne una copia online.
          </p>
          <button
            onClick={() => setPasso('spiegazione')}
            className="mt-3 rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
          >
            Rendi i dati raggiungibili da altri computer
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm leading-relaxed text-cielo-600">
            ✅ Attivo per <b>{stato.email}</b>. A ogni modifica la copia cifrata viene aggiornata da sola.
            {stato.ultimoInvio && (
              <>
                {' '}
                Ultimo invio: <b>{new Date(stato.ultimoInvio).toLocaleString('it-IT')}</b>.
              </>
            )}
            {!stato.sbloccato && (
              <>
                {' '}
                <span className="font-medium text-amber-700">
                  In questa sessione non è ancora sbloccato: serve la password.
                </span>
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {stato.sbloccato ? (
              <button
                onClick={() => void inviaOra()}
                className="rounded-lg border border-cielo-300 px-3 py-1.5 text-sm text-cielo-700 transition hover:bg-cielo-50"
              >
                Aggiorna adesso la copia online
              </button>
            ) : (
              <button
                onClick={() => void sblocca()}
                className="rounded-lg bg-cielo-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-cielo-600"
              >
                Sblocca con la password
              </button>
            )}
            <button
              onClick={() => void disattiva()}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50"
            >
              Disattiva
            </button>
          </div>
        </>
      )}

      {passo !== 'chiuso' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-cielo-200 bg-panna p-6 shadow-xl">
            {passo === 'spiegazione' && (
              <>
                <h3 className="text-lg font-semibold text-cielo-800">Come funziona (leggi prima di attivare)</h3>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-cielo-700">
                  <li>
                    🔒 <b>I dati vengono cifrati su questo computer</b> (AES-256) con una chiave che nasce
                    dalla tua password. Password e chiave <b>non escono mai</b> da qui.
                  </li>
                  <li>
                    ☁️ Online finisce solo un blocco di byte illeggibili: chi guardasse dentro il database
                    vedrebbe caratteri a caso. Nemmeno chi gestisce il server può leggere turni o cedolini.
                  </li>
                  <li>
                    💻 Da un altro computer installi CACCA, entri con la stessa email e la stessa password e
                    ritrovi tutto.
                  </li>
                  <li>
                    ⚠️ <b>Se dimentichi la password i dati online non sono recuperabili</b>: è il prezzo di
                    una cifratura vera. La copia su questo computer resta comunque leggibile.
                  </li>
                </ul>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={chiudi}
                    className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={() => setPasso('password')}
                    className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
                  >
                    Ho capito, procedi
                  </button>
                </div>
              </>
            )}

            {passo === 'password' && (
              <>
                <h3 className="text-lg font-semibold text-cielo-800">La chiave nasce dalla tua password</h3>
                <p className="mt-2 text-sm text-cielo-700">
                  Scrivi la password con cui entri in CACCA ({utente?.email}): da questa nasce la chiave di
                  cifratura. Non viene inviata a nessuno.
                </p>
                <div className="mt-3 space-y-2">
                  <input
                    autoFocus
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                  />
                  <input
                    type="password"
                    placeholder="Ripeti la password"
                    value={ripeti}
                    onChange={(e) => setRipeti(e.target.value)}
                    className={inputCls}
                  />
                </div>
                {errore && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={chiudi}
                    className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={() => void proseguiConPassword()}
                    disabled={!password}
                    className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
                  >
                    Continua
                  </button>
                </div>
              </>
            )}

            {passo === 'scelta' && (
              <>
                <h3 className="text-lg font-semibold text-cielo-800">Esiste già un archivio online</h3>
                <p className="mt-2 text-sm leading-relaxed text-cielo-700">
                  Per <b>{utente?.email}</b> c'è già una copia online
                  {esistente?.aggiornatoIl && (
                    <>
                      , aggiornata il <b>{new Date(esistente.aggiornatoIl).toLocaleString('it-IT')}</b>
                    </>
                  )}
                  {esistente?.dispositivo && <> dal computer «{esistente.dispositivo}»</>}. Cosa vuoi fare?
                </p>
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => void attiva('scarica')}
                    className="w-full rounded-lg border border-cielo-300 bg-white px-4 py-3 text-left text-sm text-cielo-800 transition hover:bg-cielo-50"
                  >
                    <b>Scarica quella online</b>
                    <span className="block text-xs text-cielo-500">
                      I dati di questo computer vengono sostituiti (ne resta una copia di sicurezza).
                    </span>
                  </button>
                  <button
                    onClick={() => void attiva('carica')}
                    className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 transition hover:bg-amber-100"
                  >
                    <b>Sostituiscila con i dati di questo computer</b>
                    <span className="block text-xs text-amber-700">
                      Quello che c'è online viene rimpiazzato da quello che vedi qui.
                    </span>
                  </button>
                </div>
                {errore && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}
                <div className="mt-4 text-right">
                  <button onClick={chiudi} className="text-sm text-cielo-600 hover:underline">
                    Annulla
                  </button>
                </div>
              </>
            )}

            {passo === 'lavoro' && (
              <div className="py-6 text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-cielo-200 border-t-cielo-500" />
                <p className="mt-4 font-medium text-cielo-800">Sto cifrando e caricando i dati…</p>
                <p className="mt-1 text-sm text-cielo-600">
                  Non chiudere il programma: il file locale resta attivo finché il caricamento non è
                  completato.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
