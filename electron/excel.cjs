// CACCA — generazione del riepilogo ore nel formato ESATTO dell'ufficio
// (stesse colonne, stessi caratteri, stesse larghezze del modello inviato
// finora: vedi "RIEPILOGO ORE C.A. …" originali). Un file per postazione/mese.

'use strict'

const ExcelJS = require('exceljs')
const motore = require('./motore.cjs')

const TNR = (size, bold) => ({ name: 'Times New Roman', size, bold: Boolean(bold) })
const APTOS = (size, bold) => ({ name: 'Aptos Narrow', size, bold: Boolean(bold) })

// Larghezze: quelle del modello originale erano troppo strette e tagliavano le
// intestazioni. Qui sono allargate quanto basta perché il testo si legga per
// intero (la struttura — colonne, X, totali — resta identica).
const LARGHEZZE = {
  A: 8, B: 17, C: 15, D: 14, E: 14, F: 14, G: 14, H: 14,
}

const BORDO_SOTTILE = { style: 'thin', color: { argb: 'FF9AA7B0' } }
const GRIGLIA = { top: BORDO_SOTTILE, left: BORDO_SOTTILE, bottom: BORDO_SOTTILE, right: BORDO_SOTTILE }

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

  // riga 5: intestazioni colonne (alte e a capo automatico: si leggono tutte)
  ws.getRow(5).height = 62
  ws.getCell('A5').value = 'GIORNO'
  ws.getCell('A5').font = APTOS(12, true)
  ws.getCell('A5').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  ws.getCell('A5').border = GRIGLIA
  for (const [lettera, testo] of INTESTAZIONI) {
    const cella = ws.getCell(`${lettera}5`)
    cella.value = testo.trim()
    cella.font = APTOS(11, true)
    cella.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cella.border = GRIGLIA
    cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF3F8' } }
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
    ws.getRow(riga).height = 18
    ws.getCell(`A${riga}`).value = g
    ws.getCell(`A${riga}`).font = APTOS(11, false)
    ws.getCell(`A${riga}`).alignment = { horizontal: 'center' }
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      ws.getCell(`${col}${riga}`).border = GRIGLIA
    }

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
  ws.mergeCells('A39:B39')
  ws.getCell('C39').value = totaleOre
  ws.getCell('C39').font = TNR(12, true)
  ws.getCell('A41').value = "TOTALE REPERIBILITA':"
  ws.getCell('A41').font = TNR(12, true)
  ws.mergeCells('A41:B41')
  ws.getCell('C41').value = totaleRep
  ws.getCell('C41').font = TNR(12, true)

  // stampa: una pagina in orizzontale
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  }
  ws.views = [{ state: 'frozen', ySplit: 6 }]

  return { wb, totaleOre, totaleRep, nomeFoglio }
}

/**
 * Stessa tabella in HTML, per la stampa in PDF: A4 verticale, intestazione
 * ripetuta a ogni pagina, totali in fondo.
 */
function componiHtml(dati) {
  const [anno, meseNum] = String(dati.mese).split('-').map(Number)
  const nomeMese = motore.MESI[meseNum - 1]
  const giorni = motore.giorniNelMese(dati.mese)

  const perData = new Map()
  for (const t of dati.turni || []) {
    const elenco = perData.get(t.data) || []
    elenco.push(t)
    perData.set(t.data, elenco)
  }
  const repPerData = new Map()
  for (const r of dati.reperibilita || []) repPerData.set(r.data, r)

  let totaleOre = 0
  let totaleRep = 0
  const righe = []
  for (let g = 1; g <= giorni; g++) {
    const iso = `${anno}-${String(meseNum).padStart(2, '0')}-${String(g).padStart(2, '0')}`
    const turniGiorno = perData.get(iso) || []
    let superfestivo = false
    const celle = motore.TIPI_TURNO.map((tipo) => {
      const suo = turniGiorno.find((t) => t.tipo === tipo.codice)
      if (suo) {
        totaleOre += tipo.ore
        if ((Number(suo.superfestivo_ore) || 0) > 0) superfestivo = true
      }
      return suo ? 'X' : ''
    })
    const rep = repPerData.get(iso)
    let testoRep = ''
    if (rep && Number(rep.quantita) > 0) {
      totaleRep += Number(rep.quantita)
      testoRep = Number(rep.quantita) > 1 ? `${rep.quantita}X` : 'X'
    }
    const feriale = turniGiorno.length === 0 && !testoRep
    righe.push(
      `<tr class="${feriale ? 'vuota' : ''}"><td class="giorno">${g}</td>` +
        celle.map((c) => `<td>${c}</td>`).join('') +
        `<td>${superfestivo ? 'X' : ''}</td><td>${testoRep}</td></tr>`,
    )
  }

  const intestazioni = motore.TIPI_TURNO.map((t) => `<th>${t.nome.toUpperCase()}</th>`).join('')
  const medico = `${String(dati.medico.cognome || '').toUpperCase()} ${String(dati.medico.nome || '').toUpperCase()}`

  // A4 ORIZZONTALE, tutto in una pagina sola: i giorni scorrono su due blocchi
  // affiancati, così le colonne restano larghe e le intestazioni leggibili.
  const meta = Math.ceil(righe.length / 2)
  const blocco = (da, a) =>
    `<table>
      <thead><tr><th class="giorno">GIORNO</th>${intestazioni}<th>SUPER<br>FESTIVO</th><th>REPERI<br>BILIT&Agrave;</th></tr></thead>
      <tbody>${righe.slice(da, a).join('')}</tbody>
    </table>`

  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 8mm 9mm; }
    body { font-family: 'Times New Roman', serif; color: #000; margin: 0; }
    h1 { font-size: 14pt; margin: 0 0 1mm; }
    .riga-testa { display: flex; justify-content: space-between; align-items: flex-end;
                  border-bottom: 0.8mm solid #000; padding-bottom: 1.5mm; margin-bottom: 3mm; }
    .medico { font-size: 12pt; font-weight: bold; text-align: right; white-space: nowrap; }
    .mese { font-size: 12pt; margin: 0; }
    .colonne { display: flex; gap: 6mm; align-items: flex-start; }
    .colonne > table { flex: 1; }
    table { border-collapse: collapse; table-layout: fixed; font-size: 8pt; width: 100%; }
    th, td { border: 0.3mm solid #9aa7b0; padding: 0.4mm 0.6mm; text-align: center; }
    th { background: #edf3f8; font-size: 6.4pt; line-height: 1.1; vertical-align: middle;
         font-family: Arial, sans-serif; height: 13mm; }
    th.giorno, td.giorno { width: 11mm; }
    td { font-family: Arial, sans-serif; font-weight: bold; height: 4.4mm; line-height: 1; }
    td.giorno { font-weight: normal; background: #f7f9fb; }
    tr.vuota td { color: #aaa; font-weight: normal; }
    .totali { margin-top: 3.5mm; font-size: 12pt; font-weight: bold; }
    .totali span { display: inline-block; margin-right: 16mm; }
    .piede { margin-top: 2.5mm; font-size: 7pt; color: #666; border-top: 0.2mm solid #ccc; padding-top: 1.5mm; }
  </style></head><body>
    <div class="riga-testa">
      <div>
        <h1>RIEPILOGO ORE C.A. POSTAZIONE DI ${dati.postazione.nome_excel}</h1>
        <p class="mese">MESE: <b>${nomeMese} ${anno}</b></p>
      </div>
      <div class="medico">DR. ${medico}</div>
    </div>
    <div class="colonne">${blocco(0, meta)}${blocco(meta, righe.length)}</div>
    <p class="totali">
      <span>TOTALE ORE DI SERVIZIO: ${totaleOre}</span>
      <span>TOTALE REPERIBILIT&Agrave;: ${totaleRep}</span>
    </p>
    <p class="piede">Documento generato da CACCA — Calcolo Automatico Cedolini Continuit&agrave; Assistenziale</p>
  </body></html>`
}

/** Nome file proposto: "RIEPILOGO ORE C.A. GUIDONIA PALOMBARA GIORNO - GENNAIO 2026.xlsx" */
function nomeFileRiepilogo(postazione, mese, estensione = 'xlsx') {
  const [anno, m] = String(mese).split('-').map(Number)
  const pulito = String(postazione.nome_excel).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return `RIEPILOGO ORE C.A. ${pulito} - ${motore.MESI[m - 1]} ${anno}.${estensione}`
}

module.exports = { componiRiepilogo, componiHtml, nomeFileRiepilogo }
