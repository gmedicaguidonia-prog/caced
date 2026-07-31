import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const LOGO = './logo.svg'

// Accesso di collaudo: SOLO in sviluppo (npm run dev) e solo se le variabili
// VITE_COLLAUDO_* sono definite in .env.local. Nel sito pubblicato non esiste.
const COLLAUDO_EMAIL = import.meta.env.DEV ? (import.meta.env.VITE_COLLAUDO_EMAIL as string | undefined) : undefined
const COLLAUDO_PASSWORD = import.meta.env.DEV ? (import.meta.env.VITE_COLLAUDO_PASSWORD as string | undefined) : undefined

/** Se il rientro dal login porta un errore nell'indirizzo, lo si mostra. */
function erroreDallUrl(): string | null {
  for (const pezzo of [window.location.search, window.location.hash.replace(/^#\/?/, '')]) {
    const p = new URLSearchParams(pezzo.startsWith('?') ? pezzo.slice(1) : pezzo)
    const descrizione = p.get('error_description') || p.get('error')
    if (descrizione) return decodeURIComponent(String(descrizione).replace(/\+/g, ' '))
  }
  return null
}

export default function LoginPage() {
  const { utente, accediConGoogle, esci } = useAuth()
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  useEffect(() => {
    const daUrl = erroreDallUrl()
    if (daUrl) {
      setErrore(`Il servizio di accesso ha risposto: «${daUrl}». Segnalalo a chi gestisce l'app.`)
      // si ripulisce l'indirizzo, così un ricaricamento non ripropone l'errore
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  async function accedi() {
    setErrore(null)
    setAttesa(true)
    const esito = await accediConGoogle()
    if (!esito.ok) {
      setAttesa(false)
      setErrore(esito.messaggio ?? 'Accesso non riuscito.')
    }
    // se riesce, il browser va su Google e poi torna qui già connesso
  }

  async function accediCollaudo() {
    if (!COLLAUDO_EMAIL || !COLLAUDO_PASSWORD) return
    setErrore(null)
    setAttesa(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: COLLAUDO_EMAIL,
      password: COLLAUDO_PASSWORD,
    })
    setAttesa(false)
    if (error) setErrore(error.message)
  }

  // connesso con Google ma non nella lista degli ammessi
  const nonAutorizzato = utente && !utente.autorizzato

  return (
    <div className="flex min-h-full items-center justify-center bg-cielo-100 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-cielo-200 bg-panna p-8 shadow-sm">
        <div className="text-center">
          <img src={LOGO} alt="CACCA" className="mx-auto h-24 w-24" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-cielo-800">CACCA</h1>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-cielo-400">
            Calcolo Automatico Cedolini Continuità Assistenziale
          </p>
        </div>

        {nonAutorizzato ? (
          <div className="mt-6 space-y-3">
            <p className="rounded-lg bg-amber-50 p-3 text-sm leading-relaxed text-amber-800">
              Sei entrato come <b>{utente.email}</b>, ma questo indirizzo non è tra quelli autorizzati a
              usare CACCA.
            </p>
            <button
              onClick={() => void esci()}
              className="w-full rounded-lg border border-cielo-300 py-2.5 text-sm text-cielo-700 transition hover:bg-cielo-50"
            >
              Esci e prova con un altro account
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <p className="text-center text-sm text-cielo-600">
              I tuoi dati ti seguono ovunque: computer, iPad, telefono.
            </p>
            <button
              onClick={() => void accedi()}
              disabled={attesa}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-cielo-300 bg-white py-2.5 font-medium text-cielo-800 transition hover:bg-cielo-50 disabled:opacity-50"
            >
              <LogoGoogle />
              {attesa ? 'Un attimo…' : 'Accedi con Google'}
            </button>
            {errore && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}
            {COLLAUDO_EMAIL && (
              <button
                onClick={() => void accediCollaudo()}
                disabled={attesa}
                className="w-full rounded-lg border border-dashed border-cielo-300 py-2 text-xs text-cielo-500 transition hover:bg-cielo-50 disabled:opacity-50"
              >
                🔧 Accesso di collaudo (solo sviluppo)
              </button>
            )}
            <p className="pt-1 text-center text-[11px] leading-relaxed text-cielo-400">
              I cedolini PDF vengono salvati nella cartella «DATI CACCA» del tuo Google Drive; turni e
              calcoli in un archivio riservato al tuo indirizzo.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 40.1 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  )
}
