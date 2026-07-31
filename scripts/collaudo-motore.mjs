// Collaudo del motore CONTRO I CEDOLINI REALI (dati in seed-dati.json, file
// locale mai versionato). Replica il calcolo mese per mese e pretende che ogni
// voce combaci al centesimo, con le SOLE tre anomalie vere note.

import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'

const require = createRequire(import.meta.url)
require('../src/lib/motore.cjs')
const motore = globalThis.__motoreCACCA

if (!existsSync(new URL('../seed-dati.json', import.meta.url))) {
  console.log('[MOTORE] seed-dati.json assente: collaudo sui cedolini reali saltato')
  process.exit(0)
}
const seed = JSON.parse(readFileSync(new URL('../seed-dati.json', import.meta.url), 'utf8'))

const quasi = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005
let errori = 0
const controlla = (nome, condizione) => {
  if (!condizione) {
    errori++
    console.log(`[MOTORE] ✗ ${nome}`)
  }
}

// tariffe e benzina come nell'app
const tariffe = [
  { tipo: 'onorario', valore: 24.25, dal: '2000-01' },
  { tipo: 'onorario', valore: 25.1, dal: '2026-02' },
  { tipo: 'air_ora', valore: 5.0, dal: '2000-01' },
  { tipo: 'reperibilita', valore: 35.09, dal: '2000-01' },
  { tipo: 'superfestivo_ora', valore: 15.0, dal: '2000-01' },
  { tipo: 'enpam_pct', valore: 15.625, dal: '2000-01' },
  { tipo: 'ra_pct', valore: 20.0, dal: '2000-01' },
]
const benzina = new Map(seed.benzina.map((b) => [b.mese, b.prezzo]))

function calcoloMese(mese) {
  const turni = seed.turni.filter((t) => t.data.startsWith(mese))
  const reperibilita = seed.reperibilita.filter((r) => r.data.startsWith(mese))
  return motore.calcolaMese({ mese, turni, reperibilita, tariffe, benzinaPrezzo: benzina.get(mese) ?? null })
}

const somma = (ced, codice) =>
  ced.voci.filter((v) => v.codice === codice && !v.rif).reduce((a, v) => a + (v.importo || 0), 0)

const anomalie = []
for (const ced of seed.cedolini) {
  const mese = motore.mesePiu(ced.rata, -1)
  const atteso = calcoloMese(mese)
  const confronti = [
    ['40', atteso.importi.onorario],
    ['45', atteso.importi.air],
    ['46', atteso.importi.superfestivo],
    ['27', atteso.importi.reperibilita],
    ['11', atteso.importi.benzina],
  ]
  for (const [codice, attesoVal] of confronti) {
    const pagato = Math.round(somma(ced, codice) * 100) / 100
    if (!quasi(attesoVal, pagato)) {
      // pagata in ritardo? (rif del mese in una rata successiva)
      const rif = `${mese.slice(5, 7)}/${mese.slice(2, 4)}`
      const recupero = seed.cedolini
        .filter((c) => c.rata > ced.rata)
        .flatMap((c) => c.voci)
        .filter((v) => v.codice === codice && v.rif === rif)
        .reduce((a, v) => a + (v.importo || 0), 0)
      if (quasi(attesoVal, pagato + recupero)) continue
      anomalie.push(`${ced.rata}|${codice}|${(pagato - attesoVal).toFixed(2)}`)
    }
  }
}
const attese = ['2026-05|27|-140.36', '2026-06|46|-180.00', '2026-07|46|-180.00']
controlla(
  `anomalie rilevate = le 3 vere (trovate: ${JSON.stringify(anomalie)})`,
  anomalie.length === 3 && attese.every((a) => anomalie.includes(a)),
)

// netto di aprile (rata senza arretrati) al centesimo
const apr = calcoloMese('2026-03')
controlla(`netto rata aprile ${apr.netto} = 3527.51`, quasi(apr.netto, 3527.51))
controlla(`lordo rata aprile ${apr.lordo} = 5225.94`, quasi(apr.lordo, 5225.94))

// superfestivi e date
controlla('Pasqua 2026', motore.pasqua(2026) === '2026-04-05')
controlla('sf 1 maggio fest12 = 12', motore.oreSuperfestiveAuto('2026-05-01', 'fest12') === 12)
controlla('sf 2 giugno fest24 = 12', motore.oreSuperfestiveAuto('2026-06-02', 'fest24') === 12)
controlla('valuta giugno anticipata', motore.dataValuta('2026-06') === '2026-06-26')

// somiglianza nomi sedi
const sim = (a, b) => Math.round(motore.somiglianzaNomi(a, b) * 100)
controlla('PALOMBARA NOt ~ Palombara Notte >= 90', sim('PALOMBARA NOt', 'Palombara Notte') >= 90)
controlla('TIVOLI ~ Palombara Notte = 0', sim('TIVOLI', 'Palombara Notte') === 0)

if (errori) {
  console.log(`[MOTORE] FALLITO: ${errori} controlli non passati`)
  process.exit(1)
}
console.log(`[MOTORE] ✓ tutto verde: ${seed.cedolini.length} cedolini replicati al centesimo, 3 anomalie vere rilevate`)
