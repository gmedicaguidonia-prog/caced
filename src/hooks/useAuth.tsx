import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { dbLocale } from '../lib/db'
import type { Utente } from '../lib/db'

type AuthState = {
  caricamento: boolean
  utente: Utente | null
  accediConGoogle: () => Promise<{ ok: boolean; messaggio?: string }>
  esci: () => Promise<void>
  ricarica: () => Promise<void>
}

const AuthCtx = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [caricamento, setCaricamento] = useState(true)
  const [utente, setUtente] = useState<Utente | null>(null)

  const ricarica = useCallback(async () => {
    setUtente(await dbLocale.auth.utente())
    setCaricamento(false)
  }, [])

  useEffect(() => {
    void ricarica()
    // al ritorno dal login Google la sessione cambia: si ricarica il profilo
    return dbLocale.auth.osserva(() => void ricarica())
  }, [ricarica])

  async function accediConGoogle() {
    const { error } = await dbLocale.auth.accediConGoogle()
    if (error) return { ok: false, messaggio: error.message }
    return { ok: true } // il browser sta andando su Google
  }

  async function esci() {
    await dbLocale.auth.esci()
    setUtente(null)
  }

  return (
    <AuthCtx.Provider value={{ caricamento, utente, accediConGoogle, esci, ricarica }}>{children}</AuthCtx.Provider>
  )
}

export function useAuth(): AuthState {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth va usato dentro <AuthProvider>')
  return c
}
