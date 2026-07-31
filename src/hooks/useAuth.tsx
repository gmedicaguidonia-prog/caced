import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { dbLocale } from '../lib/db'
import type { Utente } from '../lib/db'

type Esito = { ok: boolean; messaggio?: string }

type AuthState = {
  caricamento: boolean
  utente: Utente | null
  serveSetup: boolean
  login: (email: string, password: string) => Promise<Esito>
  registraPrimoUtente: (r: {
    nome: string | null
    cognome: string | null
    email: string
    password: string
  }) => Promise<Esito>
  esci: () => Promise<void>
  cambiaPassword: (vecchia: string, nuova: string) => Promise<Esito>
  ricarica: () => Promise<void>
}

const AuthCtx = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [caricamento, setCaricamento] = useState(true)
  const [utente, setUtente] = useState<Utente | null>(null)
  const [serveSetup, setServeSetup] = useState(false)

  async function ricarica() {
    const { data } = await dbLocale.auth.stato()
    setServeSetup(Boolean(data?.serveSetup))
    setUtente(data?.utente ?? null)
    setCaricamento(false)
  }

  useEffect(() => {
    void ricarica()
  }, [])

  async function login(email: string, password: string): Promise<Esito> {
    const { data, error } = await dbLocale.auth.login(email, password)
    if (error || !data) return { ok: false, messaggio: error?.message ?? 'Accesso non riuscito.' }
    setUtente(data)
    setServeSetup(false)
    return { ok: true }
  }

  async function registraPrimoUtente(r: {
    nome: string | null
    cognome: string | null
    email: string
    password: string
  }): Promise<Esito> {
    const { data, error } = await dbLocale.auth.setup({ ...r, ruolo: 'admin' })
    if (error || !data) return { ok: false, messaggio: error?.message ?? 'Creazione non riuscita.' }
    setUtente(data)
    setServeSetup(false)
    return { ok: true }
  }

  async function esci() {
    await dbLocale.auth.logout()
    setUtente(null)
  }

  async function cambiaPassword(vecchia: string, nuova: string): Promise<Esito> {
    const { error } = await dbLocale.auth.cambiaPassword(vecchia, nuova)
    if (error) return { ok: false, messaggio: error.message }
    return { ok: true }
  }

  return (
    <AuthCtx.Provider
      value={{ caricamento, utente, serveSetup, login, registraPrimoUtente, esci, cambiaPassword, ricarica }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth(): AuthState {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth va usato dentro <AuthProvider>')
  return c
}
