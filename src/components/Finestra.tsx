import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Finestra che vive dentro la pagina: si sposta trascinando la barra del
 * titolo, si ridimensiona dall'angolo in basso a destra, si chiude con la ×
 * o con Esc. È la stessa che in TR.A.V.I. mostra gli allegati.
 */
export default function Finestra({
  titolo,
  icona,
  larghezza = 860,
  altezza = 620,
  azioni,
  onChiudi,
  children,
}: {
  titolo: string
  icona?: ReactNode
  larghezza?: number
  altezza?: number
  /** pulsanti o collegamenti da mettere nella barra del titolo */
  azioni?: ReactNode
  onChiudi: () => void
  children: ReactNode
}) {
  const [pos, setPos] = useState(() => ({
    x: Math.max(12, Math.round((window.innerWidth - larghezza) / 2)),
    y: Math.max(12, Math.round((window.innerHeight - altezza) / 2)),
  }))
  // durante il trascinamento il contenuto non deve "mangiare" il mouse
  const [trascino, setTrascino] = useState(false)
  const scarto = useRef({ x: 0, y: 0 })

  const muovi = useCallback(
    (e: MouseEvent) => {
      setPos({
        x: Math.min(window.innerWidth - 120, Math.max(-larghezza + 160, e.clientX - scarto.current.x)),
        y: Math.min(window.innerHeight - 60, Math.max(0, e.clientY - scarto.current.y)),
      })
    },
    [larghezza],
  )

  const rilascia = useCallback(() => setTrascino(false), [])

  useEffect(() => {
    if (!trascino) return
    window.addEventListener('mousemove', muovi)
    window.addEventListener('mouseup', rilascia)
    return () => {
      window.removeEventListener('mousemove', muovi)
      window.removeEventListener('mouseup', rilascia)
    }
  }, [trascino, muovi, rilascia])

  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi()
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [onChiudi])

  function iniziaTrascinamento(e: React.MouseEvent) {
    scarto.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    setTrascino(true)
  }

  return (
    <div
      style={{ left: pos.x, top: pos.y, width: larghezza, height: altezza }}
      className="fixed z-40 flex min-h-[220px] min-w-[320px] resize overflow-hidden rounded-2xl border border-cielo-300 bg-panna shadow-2xl"
    >
      <div className="flex w-full flex-col">
        <div
          onMouseDown={iniziaTrascinamento}
          className="flex cursor-move select-none items-center gap-2 border-b border-cielo-200 bg-cielo-100 px-3 py-2"
        >
          {icona}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-cielo-800" title={titolo}>
            {titolo}
          </span>
          <span onMouseDown={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-1">
            {azioni}
            <button
              onClick={onChiudi}
              title="Chiudi (Esc)"
              className="flex h-6 w-6 items-center justify-center rounded text-cielo-600 transition hover:bg-cielo-200 hover:text-cielo-900"
            >
              ×
            </button>
          </span>
        </div>

        <div className="relative flex-1 bg-cielo-50">
          {children}
          {trascino && <div className="absolute inset-0" />}
        </div>
      </div>
    </div>
  )
}
