import { useState } from 'react'
import { dbLocale } from '../lib/db'
import { useToast } from '../hooks/useToast'

const LOGO = './logo.svg'

/** Prima entrata: si propone di creare i collegamenti sul desktop e nel menu Start. */
export default function PrimoAvvioPage({ onFine }: { onFine: () => void }) {
  const toast = useToast()
  const [desktop, setDesktop] = useState(true)
  const [menuAvvio, setMenuAvvio] = useState(true)
  const [attesa, setAttesa] = useState(false)

  async function crea() {
    setAttesa(true)
    const { data, error } = await dbLocale.collegamenti.crea({ desktop, menuAvvio })
    setAttesa(false)
    if (error) {
      toast.errore(error.message)
      return
    }
    if (data?.fatti.length) toast.ok(`Collegamenti creati: ${data.fatti.join(', ')}.`)
    onFine()
  }

  async function rimanda() {
    await dbLocale.collegamenti.rimanda()
    onFine()
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-cielo-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-cielo-200 bg-panna p-8 text-center shadow-sm">
        <img src={LOGO} alt="CACCA" className="mx-auto h-20 w-20" />
        <h1 className="mt-3 text-xl font-bold tracking-tight text-cielo-800">Benvenuto in CACCA</h1>
        <p className="mt-2 text-sm leading-relaxed text-cielo-700">
          Vuoi creare i collegamenti per aprire il programma al volo?
        </p>

        <div className="mt-5 space-y-2 text-left">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-cielo-200 bg-white px-4 py-3 text-sm text-cielo-800">
            <input type="checkbox" checked={desktop} onChange={(e) => setDesktop(e.target.checked)} />
            Icona sul desktop
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-cielo-200 bg-white px-4 py-3 text-sm text-cielo-800">
            <input type="checkbox" checked={menuAvvio} onChange={(e) => setMenuAvvio(e.target.checked)} />
            Voce nel menu Start
          </label>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => void crea()}
            disabled={attesa || (!desktop && !menuAvvio)}
            className="rounded-lg bg-cielo-500 px-5 py-2.5 font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
          >
            {attesa ? 'Creazione…' : 'Crea i collegamenti'}
          </button>
          <button
            onClick={() => void rimanda()}
            className="rounded-lg border border-cielo-300 px-5 py-2.5 text-cielo-700 transition hover:bg-cielo-50"
          >
            No, grazie
          </button>
        </div>
      </div>
    </div>
  )
}
