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

// straordinario (AIR pag. 17: «i normali compensi rapportati alla durata del
// prolungamento») — le ore in piu' pagano onorario + AIR + chilometrico alle
// stesse tariffe del mese, niente maggiorazioni, ENPAM e ritenuta a cascata
{
  const mese = '2026-03'
  const base = calcoloMese(mese)
  const turni = seed.turni.filter((t) => t.data.startsWith(mese)).map((t) => ({ ...t }))
  turni[0] = { ...turni[0], straordinario_ore: 2.5 }
  const reperibilita = seed.reperibilita.filter((r) => r.data.startsWith(mese))
  const conStra = motore.calcolaMese({ mese, turni, reperibilita, tariffe, benzinaPrezzo: benzina.get(mese) ?? null })
  const tOn = motore.tariffaVigente(tariffe, 'onorario', mese)
  const tAir = motore.tariffaVigente(tariffe, 'air_ora', mese)
  const prezzoL = benzina.get(mese) ?? 0
  controlla('straordinario: ore totali = turni + 2,5', quasi(conStra.ore, base.ore + 2.5))
  controlla('straordinario: oreTurni invariate', quasi(conStra.oreTurni, base.ore))
  controlla('straordinario: oreStraordinario = 2,5', quasi(conStra.oreStraordinario, 2.5))
  controlla('straordinario: onorario +2,5h', quasi(conStra.importi.onorario, motore.round2(base.importi.onorario + 2.5 * tOn)))
  controlla('straordinario: AIR +2,5h', quasi(conStra.importi.air, motore.round2(base.importi.air + 2.5 * tAir)))
  controlla('straordinario: chilometrico +2,5h', quasi(conStra.importi.benzina, motore.round2(conStra.ore * prezzoL)))
  controlla('straordinario: superfestivo INVARIATO', quasi(conStra.importi.superfestivo, base.importi.superfestivo))
  controlla('straordinario: reperibilita INVARIATA', quasi(conStra.importi.reperibilita, base.importi.reperibilita))
  const lordoAtteso = motore.round2(
    conStra.importi.onorario + conStra.importi.air + conStra.importi.superfestivo + conStra.importi.reperibilita + conStra.importi.benzina,
  )
  controlla('straordinario: lordo = somma voci', quasi(conStra.lordo, lordoAtteso))
  const enpamAtteso = motore.round2((conStra.lordo * 15.625) / 100)
  const nettoAtteso = motore.round2(motore.round2(conStra.lordo - enpamAtteso) * 0.8)
  controlla('straordinario: netto con ENPAM e ritenuta a cascata', quasi(conStra.netto, nettoAtteso))
  // senza straordinario tutto resta identico a prima (campo assente = 0)
  controlla('senza straordinario: lordo identico', quasi(base.lordo, calcoloMese(mese).lordo))
}

// ── NUOVO AIR (DGR 610/2026): turni da ottobre 2026 ─────────────────────
// Caso di verifica ufficiale (air_lazio_2026_note_integrazione.md §7):
// 180 ore (15 turni x 12h), 1 reperibilita', chilometrico 347,60, niente
// festivita', zona OFF. Atteso al centesimo:
//   scenario B (PNRR non riconosciuta): lordo 4.915,60 → netto 3.318,03
//   scenario A (PNRR riconosciuta):     lordo 7.367,20 → netto 4.972,86
{
  const tariffeNuove = tariffe.concat([
    { tipo: 'air_ora', valore: 0, dal: '2026-10' },
    { tipo: 'reperibilita', valore: 50.0, dal: '2026-10' },
    { tipo: 'pnrr_ora', valore: 13.62, dal: '2026-10' },
  ])
  const turniOtt = Array.from({ length: 15 }, (_, i) => ({
    data: `2026-10-${String(i + 1).padStart(2, '0')}`,
    tipo: 'nott12',
    superfestivo_ore: 0,
    straordinario_ore: 0,
    pnrr: 'boh',
  }))
  const rep = [{ data: '2026-10-01', quantita: 1 }]
  const prezzoL = 347.6 / 180 // il caso fissa il chilometrico totale
  const B = motore.calcolaMese({ mese: '2026-10', turni: turniOtt, reperibilita: rep, tariffe: tariffeNuove, benzinaPrezzo: prezzoL })
  const A = motore.calcolaMese({ mese: '2026-10', turni: turniOtt, reperibilita: rep, tariffe: tariffeNuove, benzinaPrezzo: prezzoL, bohCome: 'si' })
  controlla(`AIR 2026 B: lordo ${B.lordo} = 4915.60`, quasi(B.lordo, 4915.6))
  controlla(`AIR 2026 B: ENPAM ${B.enpam} = 768.06`, quasi(B.enpam, 768.06))
  controlla(`AIR 2026 B: ritenuta ${B.ritenuta} = 829.51`, quasi(B.ritenuta, 829.51))
  controlla(`AIR 2026 B: netto ${B.netto} = 3318.03`, quasi(B.netto, 3318.03))
  controlla(`AIR 2026 A: lordo ${A.lordo} = 7367.20`, quasi(A.lordo, 7367.2))
  controlla(`AIR 2026 A: ENPAM ${A.enpam} = 1151.13`, quasi(A.enpam, 1151.13))
  controlla(`AIR 2026 A: ritenuta ${A.ritenuta} = 1243.21`, quasi(A.ritenuta, 1243.21))
  controlla(`AIR 2026 A: netto ${A.netto} = 4972.86`, quasi(A.netto, 4972.86))
  controlla('AIR 2026: incremento AIR azzerato da ottobre', A.importi.air === 0 && B.importi.air === 0)
  controlla('AIR 2026: reperibilita 50 da ottobre', quasi(A.importi.reperibilita, 50))
  controlla('AIR 2026 B: niente PNRR sulle ore incerte', B.importi.pnrr === 0 && quasi(B.orePnrrIncerte, 180))
  controlla('AIR 2026 A: PNRR su tutte le 180 ore', quasi(A.importi.pnrr, 2451.6) && quasi(A.orePnrr, 180))

  // settembre 2026: DEVE restare tutto vecchio regime
  const set = motore.calcolaMese({
    mese: '2026-09',
    turni: [{ data: '2026-09-01', tipo: 'nott12', superfestivo_ore: 0, straordinario_ore: 0, pnrr: 'si' }],
    reperibilita: [{ data: '2026-09-02', quantita: 1 }],
    tariffe: tariffeNuove,
    benzinaPrezzo: null,
  })
  controlla('set 2026: AIR ancora 5 euro/h', quasi(set.importi.air, 60))
  controlla('set 2026: reperibilita ancora 35,09', quasi(set.importi.reperibilita, 35.09))
  controlla('set 2026: PNRR non ancora in vigore anche se postazione si', set.importi.pnrr === 0)

  // postazione riconosciuta: certa, non "incerta"; straordinario segue la maggiorazione
  const sicuro = motore.calcolaMese({
    mese: '2026-10',
    turni: [{ data: '2026-10-03', tipo: 'nott12', superfestivo_ore: 0, straordinario_ore: 2, pnrr: 'si' }],
    reperibilita: [],
    tariffe: tariffeNuove,
    benzinaPrezzo: null,
  })
  controlla('pnrr si: 14 ore maggiorate (12+2 straordinario)', quasi(sicuro.orePnrr, 14) && sicuro.orePnrrIncerte === 0)
  controlla('pnrr si: importo 14 x 13,62', quasi(sicuro.importi.pnrr, 190.68))

  // riconcilia: cedolino nuovo regime con codici IGNOTI riconosciuti per unitario
  const attesoNuovo = motore.calcolaMese({
    mese: '2026-10',
    turni: turniOtt.map((t) => ({ ...t, pnrr: 'si' })),
    reperibilita: rep,
    tariffe: tariffeNuove,
    benzinaPrezzo: prezzoL,
  })
  const cedNuovo = {
    voci: [
      { codice: '40', descrizione: 'ONORARIO PROFESSIONALE', qt: 180, uni: 25.1, rif: null, importo: 4518.0 },
      { codice: '99', descrizione: 'MAGG. ATTIVITA PNRR DM77', qt: 180, uni: 13.62, rif: null, importo: 2451.6 },
      { codice: '98', descrizione: 'REPERIBILITA NUOVO AIR', qt: 1, uni: 50.0, rif: null, importo: 50.0 },
      { codice: '11', descrizione: 'COMP. CHILOMETRICO', qt: null, uni: null, rif: null, importo: 347.6 },
      { codice: '97', descrizione: 'VOCE MISTERIOSA', qt: null, uni: null, rif: null, importo: 12.34 },
    ],
  }
  const ric = motore.riconcilia(attesoNuovo, cedNuovo)
  const riga = (nome) => ric.righe.find((r) => r.voce === nome)
  controlla('riconcilia nuovo: PNRR agganciata per unitario', riga('Maggiorazione PNRR/DM77') && riga('Maggiorazione PNRR/DM77').ok)
  controlla('riconcilia nuovo: reperibilita agganciata per unitario', riga('Reperibilità (voce 27)').ok)
  controlla('riconcilia nuovo: voce 45 assente e attesa 0 = ok', riga('Incremento A.I.R. (voce 45)').ok)
  controlla('riconcilia nuovo: onorario quadra', riga('Onorario (voce 40)').ok)
  controlla(
    'riconcilia nuovo: la voce misteriosa resta segnalata',
    Array.isArray(ric.vociSconosciute) && ric.vociSconosciute.length === 1 && ric.vociSconosciute[0].codice === '97',
  )

  // cedolino VECCHIO regime (rata ottobre = ore di settembre): nulla cambia
  const attesoVecchio = calcoloMese('2026-06')
  const ricVecchio = motore.riconcilia(attesoVecchio, seed.cedolini.find((c) => c.rata === '2026-07'))
  controlla('riconcilia vecchio: nessuna riga PNRR quando non serve', !ricVecchio.righe.some((r) => r.voce === 'Maggiorazione PNRR/DM77'))
}

// somiglianza nomi sedi
const sim = (a, b) => Math.round(motore.somiglianzaNomi(a, b) * 100)
controlla('PALOMBARA NOt ~ Palombara Notte >= 90', sim('PALOMBARA NOt', 'Palombara Notte') >= 90)
controlla('TIVOLI ~ Palombara Notte = 0', sim('TIVOLI', 'Palombara Notte') === 0)

if (errori) {
  console.log(`[MOTORE] FALLITO: ${errori} controlli non passati`)
  process.exit(1)
}
console.log(`[MOTORE] ✓ tutto verde: ${seed.cedolini.length} cedolini replicati al centesimo, 3 anomalie vere rilevate`)
