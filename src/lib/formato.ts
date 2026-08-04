// Formattazione italiana di importi e date, condivisa da tutte le pagine.

export const MESI_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

export function euro(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

/** '2026-08-27' → '27/08/2026' */
export function dataIt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, g] = String(iso).split('-')
  return `${g}/${m}/${a}`
}

/** '2026-08' → 'Agosto 2026' */
export function meseIt(mese: string | null | undefined): string {
  if (!mese) return '—'
  const [a, m] = String(mese).split('-').map(Number)
  return `${MESI_IT[m - 1]} ${a}`
}

/** '2026-08' → 'ad Agosto 2026' (la «d» eufonica davanti ai mesi con la vocale). */
export function aMeseIt(mese: string | null | undefined): string {
  const testo = meseIt(mese)
  return `${/^[AEIOU]/i.test(testo) ? 'ad' : 'a'} ${testo}`
}

/** Mese corrente 'YYYY-MM'. */
export function meseOggi(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function mesePiu(mese: string, delta: number): string {
  const [a, m] = String(mese).split('-').map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Giorni del mese 'YYYY-MM'. */
export function giorniNelMese(mese: string): number {
  const [a, m] = String(mese).split('-').map(Number)
  return new Date(a, m, 0).getDate()
}

/** 0 = lunedì … 6 = domenica per la data ISO indicata. */
export function giornoSettimana(iso: string): number {
  const [a, m, g] = String(iso).split('-').map(Number)
  return (new Date(a, m - 1, g, 12).getDay() + 6) % 7
}

export const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
