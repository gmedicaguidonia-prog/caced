// Collaudo della lettura PDF con pdfjs (lo stesso lettore usato nel browser):
// estrae il testo dei cedolini reali ricostruendo le righe per posizione,
// come fa l'app, e pretende che ogni cedolino quadri.
// Uso: node scripts/collaudo-pdfjs.mjs ["cartella con i PDF"]

import { createRequire } from 'node:module'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
require('../src/lib/motore.cjs')
const motore = globalThis.__motoreCACCA
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

const cartella = process.argv[2] || 'C:\\Users\\Stefano\\Desktop\\cedolini guardia medica'
if (!existsSync(cartella)) {
  console.log(`[PDFJS] cartella dei cedolini assente (${cartella}): collaudo saltato`)
  process.exit(0)
}

// identica alla funzione dell'app (src/lib/db.ts → estraiTestoPdf)
async function estraiTesto(buffer) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const pagine = []
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i)
    const contenuto = await pagina.getTextContent()
    const righe = new Map()
    for (const item of contenuto.items) {
      if (!item.str || !item.str.trim()) continue
      const y = Math.round(item.transform[5])
      const elenco = righe.get(y) ?? []
      elenco.push({ x: item.transform[4], testo: item.str })
      righe.set(y, elenco)
    }
    const ordinate = Array.from(righe.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, pezzi]) => pezzi.sort((a, b) => a.x - b.x).map((p) => p.testo).join(' '))
    pagine.push(ordinate.join('\n'))
  }
  return pagine.join('\n')
}

let errori = 0
for (const nome of readdirSync(cartella).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()) {
  const testo = await estraiTesto(readFileSync(path.join(cartella, nome)))
  const letto = motore.leggiCedolino(testo)
  const sommaVoci = motore.round2(letto.voci.reduce((a, v) => a + (v.importo || 0), 0))
  const quadra =
    letto.rata && letto.netto && letto.voci.length > 0 &&
    letto.totaleCompetenze !== null && Math.abs(sommaVoci - letto.totaleCompetenze) < 0.005
  if (!quadra) errori++
  console.log(
    `[PDFJS] ${quadra ? '✓' : '✗'} ${nome}: rata ${letto.rata}, voci ${letto.voci.length} (somma ${sommaVoci}), ` +
      `lordo ${letto.totaleCompetenze}, netto ${letto.netto}, iscr ${letto.iscrizione}, sede ${letto.sede}`,
  )
}
if (errori) {
  console.log(`[PDFJS] FALLITO: ${errori} cedolini non quadrano`)
  process.exit(1)
}
console.log('[PDFJS] ✓ tutti i cedolini letti e quadrati con il lettore del browser')
