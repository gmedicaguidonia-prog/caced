import { useState } from 'react'
import { dbLocale } from '../lib/db'

const LOGO = './logo.svg'

/**
 * Installazione guidata: CACCA.exe appena scaricato propone di installarsi.
 * L'utente sceglie la cartella (sfogliando), decide i collegamenti, e il
 * programma si copia lì con la sua cartella dati accanto, poi riparte.
 */
export default function PrimaSistemazionePage({
  destinazione,
  onRifiuta,
}: {
  destinazione: string
  onRifiuta: () => void
}) {
  const [dest, setDest] = useState(destinazione)
  const [desktop, setDesktop] = useState(true)
  const [menuAvvio, setMenuAvvio] = useState(true)
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function sfoglia() {
    setErrore(null)
    const { data, error } = await dbLocale.sistemazione.scegliCartella()
    if (error) {
      setErrore(error.message)
      return
    }
    if (data) setDest(data)
  }

  async function installa() {
    setAttesa(true)
    setErrore(null)
    const { error } = await dbLocale.sistemazione.esegui({
      destinazione: dest,
      collegamentoDesktop: desktop,
      collegamentoMenu: menuAvvio,
    })
    if (error) {
      setAttesa(false)
      setErrore(error.message)
    }
    // se riesce, l'app si riavvia da sola dalla cartella scelta
  }

  async function rifiuta() {
    await dbLocale.sistemazione.rifiuta()
    onRifiuta()
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-cielo-100 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-cielo-200 bg-panna p-8 shadow-sm">
        <div className="text-center">
          <img src={LOGO} alt="CACCA" className="mx-auto h-24 w-24" />
          <h1 className="mt-3 text-xl font-bold tracking-tight text-cielo-800">Installazione di CACCA</h1>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-cielo-400">
            Calcolo Automatico Cedolini Continuità Assistenziale
          </p>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-cielo-700">
          Scegli dove installare il programma: lì verrà creata la sua cartella con l'eseguibile e la
          cartella <b>dati</b> (turni, cedolini e copie di sicurezza restano sempre insieme al
          programma). Consiglio un disco diverso da C:, così un eventuale ripristino di Windows non
          tocca nulla.
        </p>

        <div className="mt-4">
          <span className="mb-1 block text-xs font-medium text-cielo-700">Cartella di installazione</span>
          <div className="flex gap-2">
            <input
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-cielo-300 bg-white px-3 py-2 text-sm text-cielo-800 outline-none transition focus:border-cielo-400"
            />
            <button
              onClick={() => void sfoglia()}
              className="shrink-0 rounded-lg border border-cielo-300 px-4 py-2 text-sm font-medium text-cielo-700 transition hover:bg-cielo-50"
            >
              Sfoglia…
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
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
            onClick={() => void installa()}
            disabled={attesa || !dest.trim()}
            className="rounded-lg bg-cielo-500 px-6 py-2.5 font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
          >
            {attesa ? 'Installazione…' : 'Installa ed avvia'}
          </button>
          <button
            onClick={() => void rifiuta()}
            disabled={attesa}
            className="rounded-lg border border-cielo-300 px-5 py-2.5 text-cielo-700 transition hover:bg-cielo-50"
          >
            Usalo da qui senza installare
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-cielo-400">
          Al termine il programma si riavvia da solo dalla cartella scelta.
        </p>
      </div>
    </div>
  )
}
