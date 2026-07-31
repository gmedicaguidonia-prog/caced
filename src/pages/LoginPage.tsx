import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'

const LOGO = './logo.svg'
const inputCls =
  'w-full rounded-lg border border-cielo-300 bg-white px-3 py-2 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-2 focus:ring-cielo-100'

export default function LoginPage() {
  const { serveSetup } = useAuth()
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
        {serveSetup ? <FormPrimoAvvio /> : <FormAccesso />}
      </div>
    </div>
  )
}

function FormAccesso() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  async function invia(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    setAttesa(true)
    const esito = await login(email, password)
    setAttesa(false)
    if (!esito.ok) setErrore(esito.messaggio ?? 'Accesso non riuscito.')
  }

  return (
    <form onSubmit={invia} className="mt-6 space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-cielo-700">Nome utente (email)</span>
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
          placeholder="nome@esempio.it"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-cielo-700">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
      </label>

      {errore && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}

      <button
        type="submit"
        disabled={attesa}
        className="w-full rounded-lg bg-cielo-500 py-2.5 font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
      >
        {attesa ? 'Accesso…' : 'Accedi'}
      </button>
      <p className="pt-1 text-center text-[11px] text-cielo-400">
        Password dimenticata? Deve reimpostarla un amministratore.
      </p>
    </form>
  )
}

function FormPrimoAvvio() {
  const { registraPrimoUtente } = useAuth()
  const [c, setC] = useState({ nome: '', cognome: '', email: '', password: '', ripeti: '' })
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  async function invia(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    if (c.password !== c.ripeti) {
      setErrore('Le due password non coincidono.')
      return
    }
    setAttesa(true)
    const esito = await registraPrimoUtente({
      nome: c.nome.trim() || null,
      cognome: c.cognome.trim() || null,
      email: c.email.trim(),
      password: c.password,
    })
    setAttesa(false)
    if (!esito.ok) setErrore(esito.messaggio ?? 'Creazione non riuscita.')
  }

  return (
    <form onSubmit={invia} className="mt-6 space-y-3">
      <p className="rounded-lg bg-cielo-50 p-3 text-sm text-cielo-700">
        <b>Primo avvio.</b> Crea l'utente amministratore. Nome e cognome verranno usati anche
        nell'intestazione dei riepiloghi excel per l'ufficio.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-cielo-700">Nome</span>
          <input value={c.nome} onChange={(e) => setC({ ...c, nome: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-cielo-700">Cognome</span>
          <input value={c.cognome} onChange={(e) => setC({ ...c, cognome: e.target.value })} className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-cielo-700">Email (nome utente) *</span>
        <input
          type="email"
          value={c.email}
          onChange={(e) => setC({ ...c, email: e.target.value })}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-cielo-700">Password * (min. 8 caratteri)</span>
        <input
          type="password"
          value={c.password}
          onChange={(e) => setC({ ...c, password: e.target.value })}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-cielo-700">Ripeti password *</span>
        <input
          type="password"
          value={c.ripeti}
          onChange={(e) => setC({ ...c, ripeti: e.target.value })}
          className={inputCls}
        />
      </label>

      {errore && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}

      <button
        type="submit"
        disabled={attesa}
        className="w-full rounded-lg bg-cielo-500 py-2.5 font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
      >
        {attesa ? 'Creazione…' : 'Crea amministratore ed entra'}
      </button>
    </form>
  )
}
