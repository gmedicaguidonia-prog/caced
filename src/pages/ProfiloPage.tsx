import { useEffect, useState } from 'react'
import { dbLocale } from '../lib/db'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'

const inputCls =
  'w-full rounded-lg border border-cielo-300 bg-white px-3 py-2 text-sm text-cielo-800 outline-none transition focus:border-cielo-400'

export default function ProfiloPage() {
  const { utente, ricarica, esci } = useAuth()
  const toast = useToast()
  const [nome, setNome] = useState('')
  const [cognome, setCognome] = useState('')

  useEffect(() => {
    setNome(utente?.nome ?? '')
    setCognome(utente?.cognome ?? '')
  }, [utente])

  async function salva() {
    const { error } = await dbLocale.auth.salvaProfilo(nome.trim() || null, cognome.trim() || null)
    if (error) {
      toast.errore(error.message)
      return
    }
    await ricarica()
    toast.ok('Profilo salvato.')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-cielo-800">Profilo</h1>

      <section className="rounded-2xl border border-cielo-200 bg-panna p-5">
        <p className="text-sm text-cielo-600">
          Sei connesso con Google come <b className="text-cielo-800">{utente?.email}</b>.
        </p>
        <p className="mt-2 text-sm text-cielo-600">
          Nome e cognome finiscono nell'intestazione dei riepiloghi per l'ufficio («DR. COGNOME NOME»).
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-cielo-700">Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-cielo-700">Cognome</span>
            <input value={cognome} onChange={(e) => setCognome(e.target.value)} className={inputCls} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => void salva()}
            className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
          >
            Salva
          </button>
          <button
            onClick={() => void esci()}
            className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
          >
            Esci dall'account
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-cielo-200 bg-panna p-5 text-sm leading-relaxed text-cielo-600">
        <h2 className="text-lg font-semibold text-cielo-800">Chi può entrare</h2>
        <p className="mt-1">
          L'accesso è riservato agli indirizzi presenti nella lista degli autorizzati. Per aggiungere un
          altro indirizzo (per esempio un secondo account tuo) chiedilo a chi amministra il database.
        </p>
      </section>
    </div>
  )
}
