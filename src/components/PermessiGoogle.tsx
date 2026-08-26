import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AMBITO_DRIVE, ricordaTokenDrive, tokenDrive } from '../lib/drive'
import { useAuth } from '../hooks/useAuth'

/**
 * Al primo ingresso controlla IN SILENZIO che Google abbia concesso tutto
 * quello che serve (identità + cartella Drive dell'app). Il login chiede già
 * tutto in una volta; qui si verifica che l'utente non abbia tolto la spunta
 * a Drive nella schermata di consenso. Se manca qualcosa compare UN solo
 * avviso che chiede tutto insieme — mai un pezzo per volta.
 *
 * Esito ricordato per indirizzo in localStorage: le aperture successive non
 * rifanno né la verifica né domande.
 */
export default function PermessiGoogle() {
  const { utente } = useAuth()
  const [mancaDrive, setMancaDrive] = useState(false)
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const chiave = utente ? `cacca_permessi_ok:${utente.email}` : null

  useEffect(() => {
    if (!utente?.autorizzato || !chiave) return
    if (localStorage.getItem(chiave) === 'si') return

    let annullato = false
    void (async () => {
      const { data } = await supabase.auth.getSession()
      const tokenGoogle = data.session?.provider_token
      // Sessione vecchia (di prima di questa versione) o accesso di collaudo:
      // nessun token Google da ispezionare → nessun controllo possibile in
      // silenzio, e quindi nessuna domanda. Al prossimo login vero si verifica.
      if (!tokenGoogle) return
      try {
        const r = await fetch(
          `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(tokenGoogle)}`,
        )
        if (!r.ok) return
        const info = (await r.json()) as { scope?: string; expires_in?: string }
        if (annullato) return
        const concessi = (info.scope ?? '').split(' ')
        if (concessi.includes(AMBITO_DRIVE)) {
          // tutto concesso: il token del login vale anche per il Drive —
          // lo si mette in cassaforte così il primo cedolino non apre popup
          ricordaTokenDrive(tokenGoogle, Math.max(60, Number(info.expires_in) || 3000))
          localStorage.setItem(chiave, 'si')
        } else {
          setMancaDrive(true)
        }
      } catch {
        /* rete assente: si riproverà alla prossima apertura */
      }
    })()
    return () => {
      annullato = true
    }
  }, [utente, chiave])

  if (!mancaDrive || !utente?.autorizzato) return null

  async function concedi() {
    setErrore(null)
    setAttesa(true)
    try {
      await tokenDrive() // apre la richiesta Google per il solo permesso mancante
      if (chiave) localStorage.setItem(chiave, 'si')
      setMancaDrive(false)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    } finally {
      setAttesa(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4">
      <div className="w-full max-w-md rounded-2xl border border-cielo-200 bg-panna p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-cielo-800">Manca un permesso di Google</h3>
        <p className="mt-2 text-sm leading-relaxed text-cielo-600">
          Nella schermata di Google non è stata concessa la casella per <b>Google Drive</b>: senza,
          CACCA non può salvare i PDF dei cedolini nella tua cartella «DATI CACCA». L&apos;app usa solo
          i file che crea lei — non vede il resto del tuo Drive.
        </p>
        {errore && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => setMancaDrive(false)}
            className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
          >
            Più tardi
          </button>
          <button
            onClick={() => void concedi()}
            disabled={attesa}
            className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
          >
            {attesa ? 'Un attimo…' : 'Concedi il permesso'}
          </button>
        </div>
      </div>
    </div>
  )
}
