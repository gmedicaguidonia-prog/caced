import { useEffect, useState } from 'react'

/**
 * Ogni tanto si controlla se in rete c'è una versione più nuova dell'app:
 * in tal caso basta ricaricare la pagina (banner arancione).
 */
export default function AggiornaWebBanner() {
  const [nuova, setNuova] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    async function controlla() {
      try {
        const r = await fetch(`./version.json?_=${Date.now()}`, { cache: 'no-store' })
        const { version } = (await r.json()) as { version: string }
        if (vivo && version && version !== __APP_VERSION__) setNuova(version)
      } catch {
        /* offline o file assente: pazienza */
      }
    }
    void controlla()
    const t = window.setInterval(controlla, 10 * 60 * 1000)
    return () => {
      vivo = false
      window.clearInterval(t)
    }
  }, [])

  if (!nuova) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-amber-500 px-5 py-3 text-white shadow-lg">
        <span className="text-sm font-medium">È disponibile la versione {nuova} di CACCA</span>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
        >
          Ricarica adesso
        </button>
      </div>
    </div>
  )
}
