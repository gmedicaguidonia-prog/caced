import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { meseOggi, mesePiu } from '../lib/formato'

/**
 * Il mese scelto è uno solo per tutto il programma: si cambia dalla barra in
 * alto e vale per registro turni, riepiloghi e previsioni.
 * Non si va oltre due mesi dopo quello corrente (più in là non c'è nulla da
 * dichiarare né da calcolare).
 */
export const MESI_AVANTI_MAX = 2

type MeseState = {
  mese: string
  impostaMese: (m: string) => void
  vaiOggi: () => void
  /** true se si può ancora andare avanti (limite: +2 mesi da oggi) */
  puoAvanzare: boolean
  meseMassimo: string
}

const MeseCtx = createContext<MeseState | undefined>(undefined)

export function MeseProvider({ children }: { children: ReactNode }) {
  const [mese, setMese] = useState(meseOggi())
  const meseMassimo = useMemo(() => mesePiu(meseOggi(), MESI_AVANTI_MAX), [])

  const impostaMese = useCallback(
    (m: string) => setMese(m > meseMassimo ? meseMassimo : m),
    [meseMassimo],
  )
  const vaiOggi = useCallback(() => setMese(meseOggi()), [])

  return (
    <MeseCtx.Provider value={{ mese, impostaMese, vaiOggi, puoAvanzare: mese < meseMassimo, meseMassimo }}>
      {children}
    </MeseCtx.Provider>
  )
}

export function useMese(): MeseState {
  const c = useContext(MeseCtx)
  if (!c) throw new Error('useMese va usato dentro <MeseProvider>')
  return c
}
