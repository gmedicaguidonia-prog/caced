import { useState } from 'react'
import { dbLocale } from '../lib/db'

const LOGO = './logo.svg'

/**
 * Il programma è stato avviato da una cartella "di passaggio" (download,
 * chiavetta…): si propone di copiarsi in una casa stabile (es. D:\CACCA),
 * dove i dati sopravvivono anche a un ripristino di Windows su C:.
 */
export default function PrimaSistemazionePage({
  destinazione,
  onRifiuta,
}: {
  destinazione: string
  onRifiuta: () => void
}) {
  const [desktop, setDesktop] = useState(true)
  const [menuAvvio, setMenuAvvio] = useState(true)
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function esegui() {
    setAttesa(true)
    setErrore(null)
    const { error } = await dbLocale.sistemazione.esegui({
      collegamentoDesktop: desktop,
      collegamentoMenu: menuAvvio,
    })
    if (error) {
      setAttesa(false)
      setErrore(error.message)
    }
    // se riesce, l'app si riavvia da sola dalla nuova posizione
  }

  async function rifiuta() {
    await dbLocale.sistemazione.rifiuta()
    onRifiuta()
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-cielo-100 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-cielo-200 bg-panna p-8 shadow-sm">
        <div className="text-center">
          <img src={LOGO} alt="CACCA" className="mx-auto h-20 w-20" />
          <h1 className="mt-3 text-xl font-bold tracking-tight text-cielo-800">Sistemiamo CACCA?</h1>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-cielo-700">
          Il programma è stato avviato da una cartella di passaggio. Ti propongo di copiarlo in{' '}
          <b>{destinazione}</b>: lì vivranno anche i tuoi dati (cartella <b>dati</b> accanto al
          programma), al riparo da pulizie dei download e — se è su un disco diverso da C: — anche da
          un eventuale ripristino di Windows.
        </p>

        <div className="mt-5 space-y-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-cielo-200 bg-white px-4 py-3 text-sm text-cielo-800">
            <input type="checkbox" checked={desktop} onChange={(e) => setDesktop(e.target.checked)} />
            Crea l'icona sul desktop
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-cielo-200 bg-white px-4 py-3 text-sm text-cielo-800">
            <input type="checkbox" checked={menuAvvio} onChange={(e) => setMenuAvvio(e.target.checked)} />
            Aggiungi al menu Start
          </label>
        </div>

        {errore && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => void esegui()}
            disabled={attesa}
            className="rounded-lg bg-cielo-500 px-5 py-2.5 font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
          >
            {attesa ? 'Sistemazione…' : `Sposta in ${destinazione}`}
          </button>
          <button
            onClick={() => void rifiuta()}
            disabled={attesa}
            className="rounded-lg border border-cielo-300 px-5 py-2.5 text-cielo-700 transition hover:bg-cielo-50"
          >
            Lascialo dov'è
          </button>
        </div>
      </div>
    </div>
  )
}
