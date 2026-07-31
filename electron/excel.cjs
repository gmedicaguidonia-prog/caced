// CACCA — generazione del riepilogo ore nel formato ESATTO dell'ufficio
// (stesse colonne, stessi caratteri, stesse larghezze del modello inviato
// finora: vedi "RIEPILOGO ORE C.A. …" originali). Un file per postazione/mese.

'use strict'

const ExcelJS = require('exceljs')
const motore = require('./motore.cjs')

const TNR = (size, bold) => ({ name: 'Times New Roman', size, bold: Boolean(bold) })
const APTOS = (size, bold) => ({ name: 'Aptos Narrow', size, bold: Boolean(bold) })

// larghezze colonne del modello originale (unità excel)
const LARGHEZZE = {
  A: 4.29, B: 11.57, C: 8.29, D: 7.86, E: 9.43, F: 7.14, G: 8.43, H: 5.57, I: 43.29,
}

const INTESTAZIONI = [
  ['B', 'TURNO NOTTURNO INFRASETTIMANALE 12 ORE'],
  ['C', 'TURNO PREFESTIVO GIORNO 10 ORE'],
  ['D', 'TURNO PREFESTIVO 22 ORE '],
  ['E', 'TURNO FESTIVO 12 ORE '],
  ['F', 'TURNO FESTIVO 24 ORE'],
  ['G', 'SUPERFESTIVO '],
  ['H', "REPERIBILITA'"],
]

/**
 * Crea il file del riepilogo mensile.
 * dati: { mese: 'YYYY-MM', postazione: { nome_excel, suffisso_foglio },
 *         medico: { cognome, nome }, turni: [{data, tipo, superfestivo_ore}],
 *         reperibilita: [{data, quantita}] }
 * Ritorna il workbook (chi chiama decide dove salvarlo).
 */
function componiRiepilogo(dati) {
  const [anno, meseNum] = String(dati.mese).split('-').map(Number)
  const nomeMese = motore.MESI[meseNum - 1]
  const giorni = motore.giorniNelMese(dati.mese)

  const wb = new ExcelJS.Workbook()
  const nomeFoglio = `${nomeMese} ${anno}${dati.postazione.suffisso_foglio || ''}`.slice(0, 31)
  const ws = wb.addWorksheet(nomeFoglio)

  for (const [lettera, width] of Object.entries(LARGHEZZE)) {
    ws.getColumn(lettera).width = width
  }

  // riga 1: titolo + medico
  ws.getRow(1).height = 75
  ws.getCell('A1').value = `RIEPILOGO ORE C.A. POSTAZIONE DI ${dati.postazione.nome_excel} `
  ws.getCell('A1').font = TNR(14, true)
  ws.getCell('F1').value = 'DR.'
  ws.getCell('F1').font = TNR(14, true)
  ws.getCell('G1').value = String(dati.medico.cognome || '').toUpperCase()
  ws.getCell('G1').font = TNR(14, true)
  ws.getCell('G1').alignment = { wrapText: true }
  ws.getCell('H1').value = String(dati.medico.nome || '').toUpperCase()
  ws.getCell('H1').font = TNR(14, true)

  // riga 3: mese e anno
  ws.getRow(3).height = 18.75
  ws.getCell('A3').value = 'MESE:'
  ws.getCell('A3').font = TNR(14, true)
  ws.getCell('B3').value = nomeMese
  ws.getCell('B3').font = TNR(14, false)
  ws.getCell('B3').alignment = { horizontal: 'center' }
  ws.getCell('C3').value = anno
  ws.getCell('C3').font = TNR(14, true)

  // riga 5: intestazioni colonne
  ws.getRow(5).height = 39
  ws.getCell('A5').value = 'GIORNO'
  ws.getCell('A5').font = APTOS(12, true)
  for (const [lettera, testo] of INTESTAZIONI) {
    const cella = ws.getCell(`${lettera}5`)
    cella.value = testo
    cella.font = APTOS(11, false)
    cella.alignment = { vertical: 'top', wrapText: true }
  }

  // giorni: righe 7 → 6+giorni (un giorno può avere PIÙ turni: più colonne con la X)
  const perData = new Map()
  for (const t of dati.turni || []) {
    const elenco = perData.get(t.data) || []
    elenco.push(t)
    perData.set(t.data, elenco)
  }
  const repPerData = new Map()
  for (const r of dati.reperibilita || []) repPerData.set(r.data, r)

  const segnaX = (cella) => {
    cella.value = 'X'
    cella.font = APTOS(11, false)
    cella.alignment = { horizontal: 'center' }
  }

  let totaleOre = 0
  let totaleRep = 0
  for (let g = 1; g <= giorni; g++) {
    const riga = 6 + g
    const iso = `${anno}-${String(meseNum).padStart(2, '0')}-${String(g).padStart(2, '0')}`
    ws.getCell(`A${riga}`).value = g
    ws.getCell(`A${riga}`).font = APTOS(11, false)

    let superfestivo = false
    for (const turno of perData.get(iso) || []) {
      const tipo = motore.tipoTurno(turno.tipo)
      if (!tipo) continue
      totaleOre += tipo.ore
      segnaX(ws.getCell(`${tipo.colonna}${riga}`))
      if ((Number(turno.superfestivo_ore) || 0) > 0) superfestivo = true
    }
    if (superfestivo) segnaX(ws.getCell(`G${riga}`))

    const rep = repPerData.get(iso)
    if (rep && Number(rep.quantita) > 0) {
      const q = Number(rep.quantita)
      totaleRep += q
      const cella = ws.getCell(`H${riga}`)
      cella.value = q > 1 ? `${q}X` : 'X'
      cella.font = APTOS(11, false)
      cella.alignment = { horizontal: 'center' }
    }
  }

  // totali (posizioni fisse come nel modello: righe 39 e 41)
  ws.getCell('A39').value = 'TOTALE ORE DI SERVIZIO:'
  ws.getCell('A39').font = TNR(12, true)
  ws.getCell('C39').value = totaleOre
  ws.getCell('C39').font = APTOS(11, false)
  ws.getCell('A41').value = "TOTALE REPERIBILITA':"
  ws.getCell('A41').font = TNR(12, true)
  ws.getCell('C41').value = totaleRep
  ws.getCell('C41').font = APTOS(11, false)

  return { wb, totaleOre, totaleRep, nomeFoglio }
}

/** Nome file proposto: "RIEPILOGO ORE C.A. GUIDONIA PALOMBARA GIORNO - GENNAIO 2026.xlsx" */
function nomeFileRiepilogo(postazione, mese) {
  const [anno, m] = String(mese).split('-').map(Number)
  const pulito = String(postazione.nome_excel).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return `RIEPILOGO ORE C.A. ${pulito} - ${motore.MESI[m - 1]} ${anno}.xlsx`
}

module.exports = { componiRiepilogo, nomeFileRiepilogo }
