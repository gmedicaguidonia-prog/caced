// Collaudo lettura cedolini: passa a pdf-parse i PDF veri e verifica che
// leggiCedolino ne estragga rata, voci e totali.
// Uso: node scripts/collaudo-cedolini.mjs "C:\cartella\con\i\pdf"

import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')
const motore = require('../electron/motore.cjs')

const cartella = process.argv[2]
if (!cartella) {
  console.error('Indica la cartella con i PDF dei cedolini.')
  process.exit(1)
}

let errori = 0
for (const nome of readdirSync(cartella).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()) {
  const percorso = path.join(cartella, nome)
  try {
    const { text } = await pdfParse(readFileSync(percorso))
    const letto = motore.leggiCedolino(text)
    const sommaVoci = motore.round2(letto.voci.reduce((a, v) => a + (v.importo || 0), 0))
    const quadra = letto.totaleCompetenze !== null && Math.abs(sommaVoci - letto.totaleCompetenze) < 0.005
    if (!letto.rata || !letto.netto || !letto.voci.length || !quadra) errori++
    console.log(
      `${nome}\n  rata ${letto.rata}  iscr ${letto.iscrizione}  voci ${letto.voci.length} (somma ${sommaVoci})  ` +
        `lordo ${letto.totaleCompetenze}  netto ${letto.netto}  valuta ${letto.valuta}  ` +
        `enpam ${letto.enpam.length}  ${quadra ? 'QUADRA ✓' : '⚠ NON QUADRA'}`,
    )
    for (const v of letto.voci) {
      console.log(`    ${v.codice.padEnd(4)} ${String(v.descrizione).slice(0, 42).padEnd(42)} ` +
        `${v.qt !== null ? 'Qt ' + v.qt : ''} ${v.uni !== null ? 'Uni ' + v.uni : ''} ${v.rif ? 'Rif ' + v.rif : ''} → ${v.importo}`)
    }
  } catch (e) {
    errori++
    console.log(`${nome}\n  ⚠ ERRORE: ${String(e && e.message)}`)
  }
}
console.log(errori ? `\n⚠ ${errori} file con problemi` : '\n✓ Tutti i cedolini letti e quadrati')
process.exit(errori ? 1 : 0)
