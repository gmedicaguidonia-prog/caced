import { useCallback, useEffect, useState } from 'react'

/**
 * Controlla se in rete c'è una pubblicazione più recente di quella in uso e,
 * in tal caso, propone di ricaricare (banner arancione in basso).
 *
 * Il confronto è sulla «sigla» della pubblicazione, non sul numero di versione:
 * il numero cambia di rado, la sigla cambia a ogni deploy. Si controlla appena
 * si apre l'app, ogni cinque minuti e ogni volta che si torna sulla finestra —
 * quest'ultimo è il caso tipico dell'app installata sul computer, che resta
 * aperta per giorni.
 */
export default function AggiornaWebBanner() {
  const [nuova, setNuova] = useState<{ versione: string; sigla: string } | null>(null)

  const controlla = useCallback(async () => {
    try {
      const r = await fetch(`./version.json?_=${Date.now()}`, { cache: 'no-store' })
      if (!r.ok) return
      const dati = (await r.json()) as { version?: string; sigla?: string }
      // senza sigla (pubblicazioni vecchie) si ricade sul numero di versione
      const diversa = dati.sigla ? dati.sigla !== __APP_SIGLA__ : Boolean(dati.version && dati.version !== __APP_VERSION__)
      if (diversa) setNuova({ versione: dati.version ?? '', sigla: dati.sigla ?? '' })
    } catch {
      /* offline o file assente: pazienza */
    }
  }, [])

  useEffect(() => {
    void controlla()
    const t = window.setInterval(() => void controlla(), 5 * 60 * 1000)
    const seTornaInVista = () => {
      if (document.visibilityState === 'visible') void controlla()
    }
    const alFuoco = () => void controlla()
    document.addEventListener('visibilitychange', seTornaInVista)
    window.addEventListener('focus', alFuoco)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', seTornaInVista)
      window.removeEventListener('focus', alFuoco)
    }
  }, [controlla])

  if (!nuova) return null

  async function ricarica() {
    // si rilegge la pagina dalla rete, così non resta in mezzo la copia vecchia
    try {
      await fetch(window.location.href, { cache: 'reload' })
    } catch {
      /* se la rete fa i capricci si ricarica lo stesso */
    }
    window.location.reload()
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-amber-500 px-5 py-3 text-white shadow-lg">
        <span className="text-sm font-medium">
          È disponibile una versione aggiornata di CACCA
          {nuova.versione && nuova.versione !== __APP_VERSION__ ? ` (${nuova.versione})` : ''}
        </span>
        <button
          onClick={() => void ricarica()}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
        >
          Ricarica adesso
        </button>
      </div>
    </div>
  )
}
