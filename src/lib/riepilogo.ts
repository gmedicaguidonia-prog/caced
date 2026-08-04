// Riepilogo turni nel formato dell'ufficio: excel scaricabile oppure PDF
// (vista di stampa A4 orizzontale, una pagina sola).

import './motore.cjs'
import type { MeseTurni, Postazione } from './db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const motore: any = (globalThis as { __motoreCACCA?: unknown }).__motoreCACCA

const INTESTAZIONI: [string, string][] = [
  ['B', 'TURNO NOTTURNO INFRASETTIMANALE 12 ORE'],
  ['C', 'TURNO PREFESTIVO GIORNO 10 ORE'],
  ['D', 'TURNO PREFESTIVO 22 ORE'],
  ['E', 'TURNO FESTIVO 12 ORE'],
  ['F', 'TURNO FESTIVO 24 ORE'],
  ['G', 'SUPERFESTIVO'],
  ['H', "REPERIBILITA'"],
]

type Dati = MeseTurni & {
  mese: string
  postazione: Postazione
  medico: { cognome: string; nome: string }
  formato: 'xlsx' | 'pdf'
}

export async function generaRiepilogo(dati: Dati): Promise<{ percorso: string; totaleOre: number; totaleRep: number }> {
  const { totaleOre, totaleRep } = totali(dati)
  const nome = nomeFile(dati.postazione, dati.mese, dati.formato)
  if (dati.formato === 'xlsx') {
    await scaricaExcel(dati, nome)
  } else {
    apriVistaStampa(dati)
  }
  return { percorso: nome, totaleOre, totaleRep }
}

function nomeFile(postazione: Postazione, mese: string, estensione: string): string {
  const [anno, m] = mese.split('-').map(Number)
  const pulito = postazione.nome_excel.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return `RIEPILOGO ORE C.A. ${pulito} - ${motore.MESI[m - 1]} ${anno}.${estensione}`
}

function totali(dati: MeseTurni): { totaleOre: number; totaleRep: number } {
  const totaleOre = dati.turni.reduce(
    (acc: number, t) => acc + (motore.tipoTurno(t.tipo)?.ore ?? 0),
    0,
  )
  const totaleRep = dati.reperibilita.reduce((acc: number, r) => acc + r.quantita, 0)
  return { totaleOre, totaleRep }
}

function perGiorno(dati: MeseTurni) {
  const turni = new Map<string, MeseTurni['turni']>()
  for (const t of dati.turni) {
    const elenco = turni.get(t.data) ?? []
    elenco.push(t)
    turni.set(t.data, elenco)
  }
  const rep = new Map(dati.reperibilita.map((r) => [r.data, r]))
  return { turni, rep }
}

// ---------------------------------------------------------------- excel

async function scaricaExcel(dati: Dati, nomeFileExcel: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'))
  const [anno, meseNum] = dati.mese.split('-').map(Number)
  const giorni = motore.giorniNelMese(dati.mese) as number

  const TNR = (size: number, bold: boolean) => ({ name: 'Times New Roman', size, bold })
  const APTOS = (size: number, bold: boolean) => ({ name: 'Aptos Narrow', size, bold })
  const BORDO = { style: 'thin' as const, color: { argb: 'FF9AA7B0' } }
  const GRIGLIA = { top: BORDO, left: BORDO, bottom: BORDO, right: BORDO }

  const wb = new ExcelJS.Workbook()
  const nomeFoglio = `${motore.MESI[meseNum - 1]} ${anno}${dati.postazione.suffisso_foglio || ''}`.slice(0, 31)
  const ws = wb.addWorksheet(nomeFoglio)
  // colonne larghe quanto basta a leggere ogni intestazione su una riga sola
  // (con un po' di margine: in stampa il foglio viene comunque adattato alla pagina)
  const larghezze: Record<string, number> = { A: 10, B: 40, C: 32, D: 26, E: 23, F: 23, G: 16, H: 17 }
  for (const [c, w] of Object.entries(larghezze)) ws.getColumn(c).width = w

  ws.getRow(1).height = 24
  ws.mergeCells('A1:E1')
  ws.getCell('A1').value = `RIEPILOGO ORE C.A. POSTAZIONE DI ${dati.postazione.nome_excel}`
  ws.getCell('A1').font = TNR(14, true)
  ws.getCell('A1').alignment = { vertical: 'middle' }
  ws.getCell('F1').value = 'DR.'
  ws.getCell('F1').font = TNR(14, true)
  ws.getCell('G1').value = dati.medico.cognome.toUpperCase()
  ws.getCell('G1').font = TNR(14, true)
  ws.getCell('H1').value = dati.medico.nome.toUpperCase()
  ws.getCell('H1').font = TNR(14, true)

  ws.getRow(3).height = 18.75
  ws.getCell('A3').value = 'MESE:'
  ws.getCell('A3').font = TNR(14, true)
  ws.getCell('B3').value = motore.MESI[meseNum - 1]
  ws.getCell('B3').font = TNR(14, false)
  ws.getCell('B3').alignment = { horizontal: 'center' }
  ws.getCell('C3').value = anno
  ws.getCell('C3').font = TNR(14, true)

  // intestazioni su una riga sola: niente testo mandato a capo
  ws.getRow(5).height = 22
  ws.getCell('A5').value = 'GIORNO'
  ws.getCell('A5').font = APTOS(11, true)
  ws.getCell('A5').alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getCell('A5').border = GRIGLIA
  for (const [lettera, testo] of INTESTAZIONI) {
    const cella = ws.getCell(`${lettera}5`)
    cella.value = testo
    cella.font = APTOS(11, true)
    cella.alignment = { vertical: 'middle', horizontal: 'center' }
    cella.border = GRIGLIA
    cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF3F8' } }
  }

  const { turni, rep } = perGiorno(dati)
  let totaleOre = 0
  let totaleRep = 0
  for (let g = 1; g <= giorni; g++) {
    const riga = 6 + g
    const iso = `${dati.mese}-${String(g).padStart(2, '0')}`
    ws.getRow(riga).height = 18
    ws.getCell(`A${riga}`).value = g
    ws.getCell(`A${riga}`).font = APTOS(11, false)
    ws.getCell(`A${riga}`).alignment = { horizontal: 'center' }
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) ws.getCell(`${col}${riga}`).border = GRIGLIA

    let superfestivo = false
    for (const turno of turni.get(iso) ?? []) {
      const tipo = motore.tipoTurno(turno.tipo)
      if (!tipo) continue
      totaleOre += tipo.ore
      const cella = ws.getCell(`${tipo.colonna}${riga}`)
      cella.value = 'X'
      cella.font = APTOS(11, false)
      cella.alignment = { horizontal: 'center' }
      if (turno.superfestivo_ore > 0) superfestivo = true
    }
    if (superfestivo) {
      const cella = ws.getCell(`G${riga}`)
      cella.value = 'X'
      cella.font = APTOS(11, false)
      cella.alignment = { horizontal: 'center' }
    }
    const r = rep.get(iso)
    if (r && r.quantita > 0) {
      totaleRep += r.quantita
      const cella = ws.getCell(`H${riga}`)
      cella.value = r.quantita > 1 ? `${r.quantita}X` : 'X'
      cella.font = APTOS(11, false)
      cella.alignment = { horizontal: 'center' }
    }
  }

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
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nomeFileExcel
  a.click()
  URL.revokeObjectURL(a.href)
}

// ---------------------------------------------------------------- PDF (vista di stampa)

function apriVistaStampa(dati: Dati): void {
  const html = componiHtml(dati)
  const finestra = window.open('', '_blank')
  if (!finestra) throw new Error('Il browser ha bloccato la finestra di stampa: consenti i pop-up per questo sito.')
  finestra.document.write(html)
  finestra.document.close()
}

function componiHtml(dati: Dati): string {
  const [anno, meseNum] = dati.mese.split('-').map(Number)
  const giorni = motore.giorniNelMese(dati.mese) as number
  const { turni, rep } = perGiorno(dati)

  let totaleOre = 0
  let totaleRep = 0
  const righe: string[] = []
  for (let g = 1; g <= giorni; g++) {
    const iso = `${dati.mese}-${String(g).padStart(2, '0')}`
    const turniGiorno = turni.get(iso) ?? []
    let superfestivo = false
    const celle = (motore.TIPI_TURNO as { codice: string; ore: number }[]).map((tipo) => {
      const suo = turniGiorno.find((t) => t.tipo === tipo.codice)
      if (suo) {
        totaleOre += tipo.ore
        if (suo.superfestivo_ore > 0) superfestivo = true
      }
      return suo ? 'X' : ''
    })
    const r = rep.get(iso)
    let testoRep = ''
    if (r && r.quantita > 0) {
      totaleRep += r.quantita
      testoRep = r.quantita > 1 ? `${r.quantita}X` : 'X'
    }
    const vuota = turniGiorno.length === 0 && !testoRep
    righe.push(
      `<tr class="${vuota ? 'vuota' : ''}"><td class="giorno">${g}</td>` +
        celle.map((c) => `<td>${c}</td>`).join('') +
        `<td>${superfestivo ? 'X' : ''}</td><td>${testoRep}</td></tr>`,
    )
  }

  // stessa impaginazione del foglio excel: una tabella sola, tutti i giorni in fila
  const teste = (motore.TIPI_TURNO as { nome: string }[]).map((t) => `<th>${t.nome.toUpperCase()}</th>`).join('')
  // ogni colonna larga in proporzione al suo titolo, così nessuna intestazione
  // va a capo né sborda dalla cella
  const colonne =
    '<colgroup>' +
    [4.4, 24.2, 18.3, 14, 12.2, 12.2, 7.8, 6.9].map((p) => `<col style="width:${p}%">`).join('') +
    '</colgroup>'
  const tabella =
    `<table>${colonne}<thead><tr><th class="giorno">GIORNO</th>${teste}<th>SUPERFESTIVO</th><th>REPERIBILIT&Agrave;</th></tr></thead>` +
    `<tbody>${righe.join('')}</tbody></table>`
  const medico = `${dati.medico.cognome.toUpperCase()} ${dati.medico.nome.toUpperCase()}`

  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
  <title>${nomeFile(dati.postazione, dati.mese, 'pdf')}</title><style>
    @page { size: A4 landscape; margin: 8mm 9mm; }
    body { font-family: 'Times New Roman', serif; color: #000; margin: 0; padding: 10px; }
    .barra { position: sticky; top: 0; background: #fff8e1; border: 1px solid #e0c36a; border-radius: 8px;
             padding: 10px 14px; margin-bottom: 12px; font-family: system-ui, sans-serif; font-size: 14px;
             display: flex; gap: 12px; align-items: center; }
    .barra button { font-size: 14px; padding: 6px 16px; border-radius: 6px; border: 1px solid #888;
                    background: #fff; cursor: pointer; }
    @media print { .barra { display: none; } body { padding: 0; } }
    h1 { font-size: 14pt; margin: 0 0 1mm; }
    .riga-testa { display: flex; justify-content: space-between; align-items: flex-end;
                  border-bottom: 0.8mm solid #000; padding-bottom: 1mm; margin-bottom: 2mm; }
    .medico { font-size: 12pt; font-weight: bold; white-space: nowrap; }
    .mese { font-size: 12pt; margin: 0; }
    table { border-collapse: collapse; table-layout: fixed; font-size: 8pt; width: 100%; }
    th, td { border: 0.3mm solid #9aa7b0; padding: 0.4mm 1mm; text-align: center; }
    /* intestazioni su una riga sola, come nel foglio excel */
    th { background: #edf3f8; font-size: 6.9pt; line-height: 1.1; vertical-align: middle;
         font-family: Arial, sans-serif; height: 6.5mm; white-space: nowrap; }
    th.giorno, td.giorno { width: 13mm; }
    td { font-family: Arial, sans-serif; font-weight: bold; height: 3.9mm; line-height: 1; }
    td.giorno { font-weight: normal; background: #f7f9fb; }
    tr.vuota td { color: #aaa; font-weight: normal; }
    .totali { margin-top: 2.5mm; margin-bottom: 0; font-size: 12pt; font-weight: bold; }
    .totali span { display: inline-block; margin-right: 16mm; }
  </style></head><body>
    <div class="barra">🖨️ Da qui puoi stampare o salvare in PDF (formato orizzontale già impostato).
      <button onclick="window.print()">Stampa / Salva PDF</button></div>
    <div class="riga-testa">
      <div>
        <h1>RIEPILOGO ORE C.A. POSTAZIONE DI ${dati.postazione.nome_excel}</h1>
        <p class="mese">MESE: <b>${motore.MESI[meseNum - 1]} ${anno}</b></p>
      </div>
      <div class="medico">DR. ${medico}</div>
    </div>
    ${tabella}
    <p class="totali"><span>TOTALE ORE DI SERVIZIO: ${totaleOre}</span><span>TOTALE REPERIBILIT&Agrave;: ${totaleRep}</span></p>
  </body></html>`
}
