import { useCallback, useEffect, useState } from 'react'
import { dbLocale } from '../lib/db'
import type { Utente } from '../lib/db'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'

const inputCls =
  'w-full rounded-lg border border-cielo-300 bg-white px-3 py-2 text-sm text-cielo-800 outline-none transition focus:border-cielo-400'

export default function UtentiPage() {
  const { utente, cambiaPassword } = useAuth()
  const toast = useToast()
  const admin = utente?.ruolo === 'admin'

  const [elenco, setElenco] = useState<Utente[]>([])
  const [nuovo, setNuovo] = useState({ nome: '', cognome: '', email: '', password: '', ruolo: 'utente' as 'admin' | 'utente' })
  const [pwd, setPwd] = useState({ vecchia: '', nuova: '' })

  const carica = useCallback(async () => {
    if (!admin) return
    const { data } = await dbLocale.utenti.list()
    setElenco(data ?? [])
  }, [admin])

  useEffect(() => {
    void carica()
  }, [carica])

  async function crea() {
    const { error } = await dbLocale.utenti.insert({
      nome: nuovo.nome.trim() || null,
      cognome: nuovo.cognome.trim() || null,
      email: nuovo.email.trim(),
      password: nuovo.password,
      ruolo: nuovo.ruolo,
    })
    if (error) {
      toast.errore(error.message)
      return
    }
    toast.ok('Utente creato.')
    setNuovo({ nome: '', cognome: '', email: '', password: '', ruolo: 'utente' })
    await carica()
  }

  async function cambiaRuolo(u: Utente, ruolo: 'admin' | 'utente') {
    const { error } = await dbLocale.utenti.update(u.id, { nome: u.nome, cognome: u.cognome, email: u.email, ruolo })
    if (error) toast.errore(error.message)
    else {
      toast.ok('Ruolo aggiornato.')
      await carica()
    }
  }

  async function resetPassword(u: Utente) {
    const nuova = window.prompt(`Nuova password per ${u.email} (minimo 8 caratteri):`)
    if (!nuova) return
    const { error } = await dbLocale.utenti.resetPassword(u.id, nuova)
    if (error) toast.errore(error.message)
    else toast.ok('Password reimpostata.')
  }

  async function elimina(u: Utente) {
    if (!window.confirm(`Eliminare l'utente ${u.email}?`)) return
    const { error } = await dbLocale.utenti.remove(u.id)
    if (error) toast.errore(error.message)
    else {
      toast.ok('Utente eliminato.')
      await carica()
    }
  }

  async function cambiaMiaPassword() {
    const esito = await cambiaPassword(pwd.vecchia, pwd.nuova)
    if (!esito.ok) {
      toast.errore(esito.messaggio ?? 'Cambio password non riuscito.')
      return
    }
    toast.ok('Password aggiornata.')
    setPwd({ vecchia: '', nuova: '' })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-cielo-800">Utenti</h1>

      {admin && (
        <section className="rounded-2xl border border-cielo-200 bg-panna p-5">
          <h2 className="text-lg font-semibold text-cielo-800">Utenti registrati</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-cielo-500">
                <th className="py-1">Utente</th>
                <th className="py-1">Ruolo</th>
                <th className="py-1 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {elenco.map((u) => (
                <tr key={u.id} className="border-t border-cielo-100">
                  <td className="py-2">
                    <p className="font-medium text-cielo-800">
                      {[u.nome, u.cognome].filter(Boolean).join(' ') || '—'}
                      {u.permanente && (
                        <span className="ml-1.5 rounded-full bg-cielo-100 px-1.5 py-0.5 text-[10px] text-cielo-600">
                          permanente
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-cielo-500">{u.email}</p>
                  </td>
                  <td className="py-2">
                    <select
                      value={u.ruolo}
                      disabled={u.permanente}
                      onChange={(e) => void cambiaRuolo(u, e.target.value as 'admin' | 'utente')}
                      className="rounded-lg border border-cielo-300 bg-white px-2 py-1 text-sm text-cielo-800"
                    >
                      <option value="admin">amministratore</option>
                      <option value="utente">utente</option>
                    </select>
                  </td>
                  <td className="py-2 text-right text-xs">
                    <button onClick={() => void resetPassword(u)} className="text-cielo-600 hover:underline">
                      reimposta password
                    </button>
                    {!u.permanente && u.id !== utente?.id && (
                      <button onClick={() => void elimina(u)} className="ml-3 text-red-600 hover:underline">
                        elimina
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 rounded-xl bg-cielo-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-cielo-500">Nuovo utente</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input placeholder="Nome" value={nuovo.nome} onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })} className={inputCls} />
              <input placeholder="Cognome" value={nuovo.cognome} onChange={(e) => setNuovo({ ...nuovo, cognome: e.target.value })} className={inputCls} />
              <input placeholder="Email *" type="email" value={nuovo.email} onChange={(e) => setNuovo({ ...nuovo, email: e.target.value })} className={inputCls} />
              <input placeholder="Password * (min. 8)" type="password" value={nuovo.password} onChange={(e) => setNuovo({ ...nuovo, password: e.target.value })} className={inputCls} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-cielo-700">
                <input
                  type="checkbox"
                  checked={nuovo.ruolo === 'admin'}
                  onChange={(e) => setNuovo({ ...nuovo, ruolo: e.target.checked ? 'admin' : 'utente' })}
                />
                amministratore
              </label>
              <button
                onClick={() => void crea()}
                disabled={!nuovo.email || !nuovo.password}
                className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
              >
                Crea utente
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-cielo-200 bg-panna p-5">
        <h2 className="text-lg font-semibold text-cielo-800">La mia password</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            placeholder="Password attuale"
            type="password"
            value={pwd.vecchia}
            onChange={(e) => setPwd({ ...pwd, vecchia: e.target.value })}
            className={inputCls}
          />
          <input
            placeholder="Nuova password (min. 8)"
            type="password"
            value={pwd.nuova}
            onChange={(e) => setPwd({ ...pwd, nuova: e.target.value })}
            className={inputCls}
          />
        </div>
        <button
          onClick={() => void cambiaMiaPassword()}
          disabled={!pwd.vecchia || !pwd.nuova}
          className="mt-3 rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
        >
          Cambia password
        </button>
      </section>
    </div>
  )
}
