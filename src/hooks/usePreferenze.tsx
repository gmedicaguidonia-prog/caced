import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { dbLocale } from '../lib/db'
import { applicaTema, temaSalvato, temaValido } from '../lib/temi'
import { useAuth } from './useAuth'

export const MENU_MIN = 170
export const MENU_MAX = 420

type PrefState = {
  tema: string
  /** larghezza della barra del menu, regolabile trascinandone il bordo */
  larghezzaMenu: number
  impostaLarghezzaMenu: (n: number) => void
  impostaTema: (id: string) => void
}

const PrefCtx = createContext<PrefState | undefined>(undefined)

export function PreferenzeProvider({ children }: { children: ReactNode }) {
  const { utente } = useAuth()
  const [tema, setTema] = useState<string>(() => temaSalvato())
  const [larghezzaMenu, setLarghezzaMenu] = useState(224)

  // applica subito il tema ricordato su questo computer
  useEffect(() => {
    applicaTema(tema)
  }, [tema])

  // al login carica le preferenze salvate dell'utente
  useEffect(() => {
    if (!utente) return
    let vivo = true
    void dbLocale.preferenze.tutte().then(({ data }) => {
      if (!vivo || !data) return
      setTema(temaValido(data.tema))
      const l = Number(data.larghezza_menu)
      if (l >= MENU_MIN && l <= MENU_MAX) setLarghezzaMenu(l)
    })
    return () => {
      vivo = false
    }
  }, [utente])

  function impostaTema(id: string) {
    const t = temaValido(id)
    setTema(t)
    if (utente) void dbLocale.preferenze.imposta('tema', t)
  }

  function impostaLarghezzaMenu(n: number) {
    const larghezza = Math.min(MENU_MAX, Math.max(MENU_MIN, Math.round(n)))
    setLarghezzaMenu(larghezza)
    if (utente) void dbLocale.preferenze.imposta('larghezza_menu', String(larghezza))
  }

  return (
    <PrefCtx.Provider value={{ tema, larghezzaMenu, impostaTema, impostaLarghezzaMenu }}>
      {children}
    </PrefCtx.Provider>
  )
}

export function usePreferenze(): PrefState {
  const c = useContext(PrefCtx)
  if (!c) throw new Error('usePreferenze va usato dentro <PreferenzeProvider>')
  return c
}
