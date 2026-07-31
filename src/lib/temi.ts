// Temi dell'interfaccia: cambiano SOLO i colori d'identità (variabili --t-* in
// index.css). La scelta è salvata nelle preferenze dell'utente e in localStorage
// come cache locale, per applicarla subito all'avvio senza "lampo" di colore.

export interface Tema {
  id: string
  nome: string
  c1: string // colore forte del quadratino
  c2: string // colore chiaro del quadratino
}

export const TEMI: Tema[] = [
  { id: 'azzurro', nome: 'Celeste pastello', c1: '#5aa7d6', c2: '#f0f7fb' },
  { id: 'verde', nome: 'Verde bosco', c1: '#476540', c2: '#f4f1ea' },
  { id: 'bordeaux', nome: 'Bordeaux pastello', c1: '#b0687a', c2: '#f9f3f4' },
  { id: 'antracite', nome: 'Antracite pastello', c1: '#7a8896', c2: '#f4f6f7' },
]

const TEMA_PREDEFINITO = 'azzurro'
const LS_TEMA = 'cacca_tema'

export function temaValido(id: string | null | undefined): string {
  return TEMI.some((t) => t.id === id) ? (id as string) : TEMA_PREDEFINITO
}

/** Applica il tema al documento e lo ricorda su questo computer. */
export function applicaTema(id: string): void {
  const t = temaValido(id)
  document.documentElement.dataset.tema = t
  try {
    localStorage.setItem(LS_TEMA, t)
  } catch {
    /* ignora */
  }
}

/** Tema ricordato su questo computer (usato all'avvio, prima del login). */
export function temaSalvato(): string {
  try {
    return temaValido(localStorage.getItem(LS_TEMA))
  } catch {
    return TEMA_PREDEFINITO
  }
}
