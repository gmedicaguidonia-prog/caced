import { useEffect } from 'react'

/** Chiude una finestrella con il tasto Esc (comodo e atteso da tutti). */
export function useEscape(onChiudi: () => void): void {
  useEffect(() => {
    function tasto(e: KeyboardEvent) {
      if (e.key === 'Escape') onChiudi()
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [onChiudi])
}
