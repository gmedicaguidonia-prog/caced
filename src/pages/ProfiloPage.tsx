import { useCallback, useEffect, useState } from 'react'
import { dbLocale } from '../lib/db'
import type { Autorizzato } from '../lib/db'
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

      {utente?.admin && <GestioneUtenti mioIndirizzo={utente.email} />}
    </div>
  )
}

/** Riquadri riservati all'amministratore: creazione di un nuovo utente e
 *  lista di chi può entrare. Gli altri utenti non li vedono (e comunque le
 *  policy del database gli impedirebbero sia la lettura sia l'inserimento). */
function GestioneUtenti({ mioIndirizzo }: { mioIndirizzo: string }) {
  const toast = useToast()
  const [lista, setLista] = useState<Autorizzato[] | null>(null)
  const [nome, setNome] = useState('')
  const [cognome, setCognome] = useState('')
  const [email, setEmail] = useState('')
  const [problema, setProblema] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  const carica = useCallback(async () => {
    const { data } = await dbLocale.autorizzati.elenco()
    if (data) setLista(data)
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  async function crea() {
    setProblema(null)
    setAttesa(true)
    const { data, error } = await dbLocale.autorizzati.crea({ nome, cognome, email })
    setAttesa(false)
    if (error) {
      setProblema(error.message)
      return
    }
    toast.ok(`${data!.nome} ${data!.cognome} può entrare in CACCA con ${data!.email}.`)
    setNome('')
    setCognome('')
    setEmail('')
    await carica()
  }

  async function rimuovi(a: Autorizzato) {
    if (!window.confirm(`Togliere l'accesso a ${a.nome ?? ''} ${a.cognome ?? ''} (${a.email})?
I suoi dati restano nel database: se lo riaggiungi li ritrova.`)) return
    const { error } = await dbLocale.autorizzati.rimuovi(a.email)
    if (error) {
      toast.errore(error.message)
      return
    }
    toast.ok(`${a.email} non può più entrare.`)
    await carica()
  }

  return (
    <>
      <section className="rounded-2xl border border-cielo-200 bg-panna p-5">
        <h2 className="text-lg font-semibold text-cielo-800">Crea nuovo utente</h2>
        <p className="mt-1 text-sm text-cielo-600">
          Il nuovo medico entrerà con il suo account Google e avrà un archivio tutto suo, separato dal
          tuo. Usa l'indirizzo con cui fa il login Google.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-cielo-700">Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} placeholder="Maria" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-cielo-700">Cognome</span>
            <input value={cognome} onChange={(e) => setCognome(e.target.value)} className={inputCls} placeholder="Rossi" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-cielo-700">Indirizzo email (account Google)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="maria.rossi@gmail.com"
            />
          </label>
        </div>
        {problema && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{problema}</p>}
        <button
          onClick={() => void crea()}
          disabled={attesa || !nome.trim() || !cognome.trim() || !email.trim()}
          className="mt-4 rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
        >
          {attesa ? 'Creazione…' : 'Crea utente'}
        </button>
      </section>

      <section className="rounded-2xl border border-cielo-200 bg-panna p-5 text-sm leading-relaxed text-cielo-600">
        <h2 className="text-lg font-semibold text-cielo-800">Chi può entrare</h2>
        {!lista ? (
          <p className="mt-2 text-cielo-500">Caricamento…</p>
        ) : (
          <ul className="mt-3 divide-y divide-cielo-100">
            {lista.map((a) => (
              <li key={a.email} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-cielo-800">
                    {(a.nome ?? '') + ' ' + (a.cognome ?? '')}
                    {a.admin && (
                      <span className="ml-2 rounded-full bg-cielo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cielo-600">
                        amministratore
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-cielo-500">{a.email}</p>
                </div>
                {a.email !== mioIndirizzo && (
                  <button
                    onClick={() => void rimuovi(a)}
                    title="Togli l'accesso (i suoi dati restano)"
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 transition hover:bg-red-50"
                  >
                    Togli accesso
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
