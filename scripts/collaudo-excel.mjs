// Collaudo generazione excel: prende un mese dal seed e scrive il riepilogo
// nel formato dell'ufficio, per confrontarlo con l'originale.
// Uso: node scripts/collaudo-excel.mjs 2025-12 giorno "C:\destinazione.xlsx"

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const excel = require('../electron/excel.cjs')

const [mese, chiave, destinazione] = process.argv.slice(2)
if (!mese || !chiave || !destinazione) {
  console.error('Uso: node scripts/collaudo-excel.mjs <YYYY-MM> <giorno|notte> <file.xlsx>')
  process.exit(1)
}

const seed = JSON.parse(readFileSync(new URL('../electron/seed-dati.json', import.meta.url), 'utf8'))
const postazione = seed.postazioni.find((p) => p.chiave === chiave)
const turni = seed.turni.filter((t) => t.postazione === chiave && t.data.startsWith(mese))
const reperibilita = seed.reperibilita.filter((r) => r.postazione === chiave && r.data.startsWith(mese))

const { wb, totaleOre, totaleRep, nomeFoglio } = excel.componiRiepilogo({
  mese,
  postazione,
  medico: { cognome: 'MARABELLI', nome: 'STEFANO' },
  turni,
  reperibilita,
})
await wb.xlsx.writeFile(destinazione)
console.log(`Scritto ${destinazione} — foglio "${nomeFoglio}", ${totaleOre} ore, ${totaleRep} reperibilità`)
