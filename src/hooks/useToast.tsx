import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Avvisi a comparsa: ogni operazione (salva, importa, genera…) dice com'è
 * andata con un riquadro al centro dello schermo.
 */
export type TipoToast = 'ok' | 'errore' | 'avviso'

type Toast = { id: number; tipo: TipoToast; testo: string }

type Ctx = {
  ok: (testo: string) => void
  errore: (testo: string) => void
  avviso: (testo: string) => void
  /** comodo per gli esiti {ok, messaggio} del motore dati */
  esito: (e: { ok: boolean; messaggio?: string }, seRiuscito?: string) => void
}

const ToastCtx = createContext<Ctx | undefined>(undefined)

// gli errori restano più a lungo: c'è da leggerli
const DURATA: Record<TipoToast, number> = { ok: 4500, avviso: 7000, errore: 9000 }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [elenco, setElenco] = useState<Toast[]>([])
  const prossimo = useRef(1)

  const chiudi = useCallback((id: number) => {
    setElenco((e) => e.filter((t) => t.id !== id))
  }, [])

  const mostra = useCallback(
    (tipo: TipoToast, testo: string) => {
      const pulito = String(testo ?? '').trim()
      if (!pulito) return
      const id = prossimo.current++
      setElenco((e) => [...e.slice(-3), { id, tipo, testo: pulito }])
      window.setTimeout(() => chiudi(id), DURATA[tipo])
    },
    [chiudi],
  )

  const ok = useCallback((t: string) => mostra('ok', t), [mostra])
  const errore = useCallback((t: string) => mostra('errore', t), [mostra])
  const avviso = useCallback((t: string) => mostra('avviso', t), [mostra])
  const esito = useCallback(
    (e: { ok: boolean; messaggio?: string }, seRiuscito?: string) => {
      const testo = e.messaggio ?? (e.ok ? (seRiuscito ?? 'Fatto.') : 'Operazione non riuscita.')
      mostra(e.ok ? 'ok' : 'errore', e.ok ? (seRiuscito ?? testo) : testo)
    },
    [mostra],
  )

  return (
    <ToastCtx.Provider value={{ ok, errore, avviso, esito }}>
      {children}
      <div className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 p-4">
        {elenco.map((t) => (
          <Riquadro key={t.id} toast={t} onChiudi={() => chiudi(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

function Riquadro({ toast, onChiudi }: { toast: Toast; onChiudi: () => void }) {
  const stile =
    toast.tipo === 'ok'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : toast.tipo === 'errore'
        ? 'border-red-300 bg-red-50 text-red-900'
        : 'border-amber-300 bg-amber-50 text-amber-900'
  const segno = toast.tipo === 'ok' ? '✓' : toast.tipo === 'errore' ? '✕' : '!'

  return (
    <div
      role="status"
      onClick={onChiudi}
      className={`toast-entra pointer-events-auto flex w-[min(28rem,calc(100vw-2rem))] cursor-pointer items-start gap-3 rounded-xl border-2 p-4 text-sm shadow-2xl ${stile}`}
    >
      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-bold">
        {segno}
      </span>
      <span className="min-w-0 flex-1 break-words leading-snug">{toast.testo}</span>
      <span className="shrink-0 text-xs opacity-50">✕</span>
    </div>
  )
}

export function useToast(): Ctx {
  const c = useContext(ToastCtx)
  if (!c) throw new Error('useToast va usato dentro <ToastProvider>')
  return c
}
