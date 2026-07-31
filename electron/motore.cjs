// CACCA — motore di calcolo puro (nessun accesso a database o disco).
// Qui vivono le regole del contratto: tipi di turno, festività "superfestive"
// dell'AIR Lazio, tariffe con decorrenza, calcolo del compenso mensile con gli
// stessi arrotondamenti di NoiPA, lettura del testo dei cedolini e confronto
// tra atteso e pagato. Tutto testato nello smoke test contro i cedolini veri.
//
// Modulo "universale": CommonJS per Electron (require) e variabile globale
// __motoreCACCA per l'anteprima browser di sviluppo (Vite serve i .cjs come
// ESM senza interoperabilità: senza questo accorgimento l'anteprima si rompe).

'use strict'

;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module && typeof module.exports === 'object') {
    module.exports = api
  }
  root.__motoreCACCA = api
})(globalThis, function () {

const MESI = [
  'GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
  'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE',
]

// ---------- tipi di turno (le colonne del modello dell'ufficio) ----------
// I segmenti sono ore dall'inizio del giorno: la notte prosegue oltre le 24
// (20→32 significa dalle 20:00 alle 08:00 del giorno dopo).
const TIPI_TURNO = [
  { codice: 'nott12', nome: 'Turno notturno infrasettimanale 12 ore', ore: 12, colonna: 'B', segmenti: [[20, 32]] },
  { codice: 'pref_g10', nome: 'Turno prefestivo giorno 10 ore', ore: 10, colonna: 'C', segmenti: [[10, 20]] },
  { codice: 'pref22', nome: 'Turno prefestivo 22 ore', ore: 22, colonna: 'D', segmenti: [[10, 32]] },
  { codice: 'fest12', nome: 'Turno festivo 12 ore', ore: 12, colonna: 'E', segmenti: [[8, 20]] },
  { codice: 'fest24', nome: 'Turno festivo 24 ore', ore: 24, colonna: 'F', segmenti: [[8, 32]] },
]

function tipoTurno(codice) {
  return TIPI_TURNO.find((t) => t.codice === codice) || null
}

// ---------- date ----------
function pad2(n) {
  return String(n).padStart(2, '0')
}

/** 'YYYY-MM-DD' → oggetto Date locale (mezzogiorno: al riparo dai fusi). */
function daISO(iso) {
  const [a, m, g] = String(iso).split('-').map(Number)
  return new Date(a, m - 1, g, 12)
}

function aISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Giorni del mese 'YYYY-MM' → numero (28..31). */
function giorniNelMese(mese) {
  const [a, m] = String(mese).split('-').map(Number)
  return new Date(a, m, 0).getDate()
}

/** Mese successivo/precedente di 'YYYY-MM'. */
function mesePiu(mese, delta) {
  const [a, m] = String(mese).split('-').map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

/** Etichetta italiana: '2026-01' → 'GENNAIO 2026'. */
function etichettaMese(mese) {
  const [a, m] = String(mese).split('-').map(Number)
  return `${MESI[m - 1]} ${a}`
}

/** Domenica di Pasqua (algoritmo di Meeus) → 'YYYY-MM-DD'. */
function pasqua(anno) {
  const a = anno % 19
  const b = Math.floor(anno / 100)
  const c = anno % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mese = Math.floor((h + l - 7 * m + 114) / 31)
  const giorno = ((h + l - 7 * m + 114) % 31) + 1
  return `${anno}-${pad2(mese)}-${pad2(giorno)}`
}

/** Festività nazionali dell'anno (per colorare il calendario). */
function festiviAnno(anno) {
  const fissi = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26']
  const insieme = new Set(fissi.map((g) => `${anno}-${g}`))
  const p = daISO(pasqua(anno))
  insieme.add(aISO(p))
  const lunedi = new Date(p)
  lunedi.setDate(p.getDate() + 1)
  insieme.add(aISO(lunedi))
  return insieme
}

// ---------- superfestivi (AIR Lazio, art. 23: +15 €/h) ----------
// Fasce: giorno = 08–20 della data; notte = 20:00 della data → 08:00 del giorno dopo.
// Il 29 giugno vale solo per Roma Capitale: le postazioni ASL RM5 sono escluse.
/** Mappa 'YYYY-MM-DD' → { giorno: bool, notte: bool } per l'anno indicato. */
function superfestiviAnno(anno) {
  const m = new Map()
  const segna = (iso, fascia) => {
    const v = m.get(iso) || { giorno: false, notte: false }
    v[fascia] = true
    m.set(iso, v)
  }
  segna(`${anno}-01-01`, 'giorno')
  segna(`${anno}-01-06`, 'giorno')
  const p = daISO(pasqua(anno))
  segna(aISO(p), 'giorno')
  segna(aISO(p), 'notte')
  const lunedi = new Date(p)
  lunedi.setDate(p.getDate() + 1)
  segna(aISO(lunedi), 'giorno')
  segna(`${anno}-04-25`, 'giorno')
  segna(`${anno}-05-01`, 'giorno')
  segna(`${anno}-06-02`, 'giorno')
  segna(`${anno}-08-15`, 'giorno')
  segna(`${anno}-11-01`, 'giorno')
  segna(`${anno}-12-08`, 'giorno')
  segna(`${anno}-12-24`, 'notte')
  segna(`${anno}-12-25`, 'giorno')
  segna(`${anno}-12-25`, 'notte')
  segna(`${anno}-12-26`, 'giorno')
  segna(`${anno}-12-31`, 'notte')
  return m
}

/**
 * Ore in fascia superfestiva per un turno del tipo indicato nella data indicata.
 * Proposta automatica: l'utente può correggerla (es. colonna E usata per la
 * notte di Capodanno).
 */
function oreSuperfestiveAuto(dataISO, codiceTipo) {
  const tipo = tipoTurno(codiceTipo)
  if (!tipo) return 0
  const anno = Number(String(dataISO).slice(0, 4))
  const sf = superfestiviAnno(anno).get(String(dataISO))
  // la notte del turno può cadere nella fascia notturna del giorno stesso
  const fasce = []
  if (sf && sf.giorno) fasce.push([8, 20])
  if (sf && sf.notte) fasce.push([20, 32])
  let ore = 0
  for (const [da, a] of tipo.segmenti) {
    for (const [fda, fa] of fasce) {
      ore += Math.max(0, Math.min(a, fa) - Math.max(da, fda))
    }
  }
  return ore
}

// ---------- numeri e arrotondamenti (come NoiPA) ----------
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/** '2.764,50' → 2764.5 (formato numerico italiano). */
function numeroIt(testo) {
  if (testo === null || testo === undefined) return null
  const pulito = String(testo).replace(/\./g, '').replace(',', '.').trim()
  const n = Number(pulito)
  return Number.isFinite(n) ? n : null
}

function euro(n) {
  return (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---------- tariffe con decorrenza ----------
// tariffe: [{ tipo, valore, dal }] con dal = 'YYYY-MM' riferito al MESE DI LAVORO.
function tariffaVigente(tariffe, tipo, meseLavoro) {
  let scelta = null
  for (const t of tariffe) {
    if (t.tipo !== tipo) continue
    if (String(t.dal) > String(meseLavoro)) continue
    if (!scelta || String(t.dal) > String(scelta.dal)) scelta = t
  }
  return scelta ? Number(scelta.valore) : 0
}

// ---------- calcolo del mese ----------
/**
 * Calcola il compenso atteso per le ore di un mese di lavoro.
 * turni: [{ data, tipo, superfestivo_ore }] · reperibilita: [{ data, quantita }]
 * benzinaPrezzo: €/litro del mese (voce chilometrica ACN art. 72 c.2 = prezzo
 * di un litro di benzina verde per ogni ora di attività). Se assente → 0 e
 * la stima viene marcata come parziale.
 */
function calcolaMese({ mese, turni, reperibilita, tariffe, benzinaPrezzo }) {
  let ore = 0
  let oreSf = 0
  let nTurni = 0
  for (const t of turni || []) {
    const tipo = tipoTurno(t.tipo)
    if (!tipo) continue
    ore += tipo.ore
    nTurni += 1
    oreSf += Number(t.superfestivo_ore) || 0
  }
  let rep = 0
  for (const r of reperibilita || []) rep += Number(r.quantita) || 0

  const tOnorario = tariffaVigente(tariffe, 'onorario', mese)
  const tAir = tariffaVigente(tariffe, 'air_ora', mese)
  const tRep = tariffaVigente(tariffe, 'reperibilita', mese)
  const tSf = tariffaVigente(tariffe, 'superfestivo_ora', mese)
  const pctEnpam = tariffaVigente(tariffe, 'enpam_pct', mese)
  const pctRa = tariffaVigente(tariffe, 'ra_pct', mese)

  const onorario = round2(ore * tOnorario)
  const air = round2(ore * tAir)
  const superfestivo = round2(oreSf * tSf)
  const repImporto = round2(rep * tRep)
  const benzina = benzinaPrezzo ? round2(ore * Number(benzinaPrezzo)) : 0

  const lordo = round2(onorario + air + superfestivo + repImporto + benzina)
  const enpam = round2((lordo * pctEnpam) / 100)
  const imponibile = round2(lordo - enpam)
  const ritenuta = round2((imponibile * pctRa) / 100)
  const netto = round2(imponibile - ritenuta)

  return {
    mese,
    ore,
    oreSuperfestive: oreSf,
    turni: nTurni,
    reperibilita: rep,
    tariffe: { onorario: tOnorario, air: tAir, reperibilita: tRep, superfestivo: tSf, enpam: pctEnpam, ra: pctRa },
    benzinaPrezzo: benzinaPrezzo ? Number(benzinaPrezzo) : null,
    importi: { onorario, air, superfestivo, reperibilita: repImporto, benzina },
    lordo,
    enpam,
    imponibile,
    ritenuta,
    netto,
  }
}

/** Rata (mese di pagamento) delle ore di un mese: il mese successivo. */
function rataDelMese(meseLavoro) {
  return mesePiu(meseLavoro, 1)
}

/** Data di valuta della rata: il 27 del mese, anticipato se cade nel fine settimana. */
function dataValuta(rata) {
  const [a, m] = String(rata).split('-').map(Number)
  const d = new Date(a, m - 1, 27, 12)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  return aISO(d)
}

// ---------- lettura del cedolino (testo estratto dal PDF NoiPA/AREAS) ----------
const MESI_RATA = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
}

// Un importo NoiPA ha SEMPRE due decimali ("3.707,94"): è l'appiglio che
// permette di leggere anche il testo "incollato" estratto dai PDF, dove
// descrizioni e numeri arrivano senza spazi ("40ONORARIO PROFESSIONALE2.764,50",
// "Uni 35,09315,81", "3.128,57625,71").
const IMP = '\\d{1,3}(?:\\.\\d{3})*,\\d{2}'

/**
 * Estrae i dati essenziali dal testo di un cedolino (spaziato o incollato).
 * Ritorna { rata, iscrizione, sede, voci, enpam, ritenuta, totaleCompetenze,
 * totaleRitenute, netto, valuta } — i campi non trovati restano null.
 */
function leggiCedolino(testo) {
  const t = String(testo || '')
  const righe = t.split(/\r?\n/).map((r) => r.trim()).filter(Boolean)

  const esito = {
    rata: null,
    iscrizione: null,
    sede: null,
    voci: [],
    enpam: [],
    ritenuta: null,
    totaleCompetenze: null,
    totaleRitenute: null,
    netto: null,
    valuta: null,
  }

  const mRata = t.match(/RATA\s*:\s*([A-Za-zàé]+)\s*(\d{4})/)
  if (mRata) {
    const mese = MESI_RATA[mRata[1].toLowerCase()]
    if (mese) esito.rata = `${mRata[2]}-${pad2(mese)}`
  }
  const mIscr = t.match(/iscrizione\s*:\s*(\d{6,})/i)
  if (mIscr) esito.iscrizione = mIscr[1]
  const mSede = t.match(/Sede di servizio\s*:\s*([^\n]+)/i)
  if (mSede) esito.sede = mSede[1].trim()
  const mValuta = t.match(/Valuta\/?Esigibilit[àa]\s*:?\s*(\d{1,2})\s*([A-Za-zàé]+)\s*(\d{4})/)
  if (mValuta) {
    const mese = MESI_RATA[mValuta[2].toLowerCase()]
    if (mese) esito.valuta = `${mValuta[3]}-${pad2(mese)}-${pad2(Number(mValuta[1]))}`
  }

  // Voci di dettaglio: codice (11, 27, 40, 45, 46, 86A…), descrizione,
  // eventuali Qt/Uni/Rif, importo finale. Nel testo "incollato" il codice è
  // attaccato alla descrizione: il codice si prende numerico, e la lettera
  // iniziale della descrizione passa al codice solo per le voci alfanumeriche
  // conosciute (es. 86A).
  const CODICI_ALFA = new Set(['86A'])
  const reVoce = new RegExp(
    '^(\\d{1,3})\\s*([A-ZÀ-Ü].*?)' +
      `(?:\\s*Qt\\s*(${IMP}))?` +
      `(?:\\s*Uni\\s*(${IMP}))?` +
      '(?:\\s*Rif\\s*(\\d{2}/\\d{2}))?' +
      `\\s*(${IMP})$`,
  )
  const vociGiaViste = new Set()
  for (const riga of righe) {
    // le righe ENPAM e i totali si gestiscono a parte
    if (/ENPAM|RITENUTA|Totale/i.test(riga)) continue
    const m = riga.match(reVoce)
    if (!m) continue
    let codice = m[1]
    let descrizione = m[2].trim()
    if (CODICI_ALFA.has(codice + descrizione[0])) {
      codice = codice + descrizione[0]
      descrizione = descrizione.slice(1).trim()
    }
    const voce = {
      codice,
      descrizione,
      qt: m[3] ? numeroIt(m[3]) : null,
      uni: m[4] ? numeroIt(m[4]) : null,
      rif: m[5] || null,
      importo: numeroIt(m[6]),
    }
    // il cedolino ripete il dettaglio su più pagine: ogni voce si conta una volta
    const chiave = `${voce.codice}|${voce.qt}|${voce.uni}|${voce.rif}|${voce.importo}`
    if (vociGiaViste.has(chiave)) continue
    vociGiaViste.add(chiave)
    esito.voci.push(voce)
  }

  // Ritenute ENPAM: "ENPAM Cassa PensioneAA.CC. 3.707,94 15,625 su 100 579,37"
  const reEnpam = new RegExp(`ENPAM\\s*(.+?)\\s*(${IMP})\\s*(\\d{1,3}(?:,\\d+)?)\\s*su\\s*100\\s*(${IMP})`, 'g')
  const enpamVisti = new Set()
  let mE
  while ((mE = reEnpam.exec(t)) !== null) {
    const riga = { cassa: mE[1].trim(), imponibile: numeroIt(mE[2]), aliquota: numeroIt(mE[3]), importo: numeroIt(mE[4]) }
    const chiave = `${riga.cassa}|${riga.imponibile}|${riga.importo}`
    if (enpamVisti.has(chiave)) continue
    enpamVisti.add(chiave)
    esito.enpam.push(riga)
  }

  const mRit = t.match(new RegExp(`RITENUTA D'ACCONTO\\s*(${IMP})\\s*(${IMP})`))
  if (mRit) esito.ritenuta = { imponibile: numeroIt(mRit[1]), importo: numeroIt(mRit[2]) }

  const mTot = t.match(new RegExp(`Totale\\s*:\\s*(${IMP})\\s*(${IMP})`))
  if (mTot) {
    esito.totaleRitenute = numeroIt(mTot[1])
    esito.totaleCompetenze = numeroIt(mTot[2])
  }
  const mNetto = t.match(new RegExp(`Totale netto\\s*:\\s*(${IMP})`))
  if (mNetto) esito.netto = numeroIt(mNetto[1])

  return esito
}

// ---------- riconciliazione cedolino ↔ atteso ----------
/**
 * Confronta un cedolino letto (rata) con il calcolo atteso del mese precedente.
 * Ritorna { righe: [...], arretrati: [...], anomalie: n } dove ogni riga è
 * { voce, atteso, pagato, delta, ok, testo }.
 */
function riconcilia(atteso, cedolino) {
  const righe = []
  const arretrati = []
  const somma = (filtro) =>
    round2(
      (cedolino.voci || [])
        .filter((v) => filtro(v) && !v.rif)
        .reduce((acc, v) => acc + (v.importo || 0), 0),
    )

  for (const v of cedolino.voci || []) {
    if (v.rif) arretrati.push(v)
  }

  const confronta = (nome, attesoVal, pagatoVal, nota) => {
    const delta = round2((pagatoVal || 0) - (attesoVal || 0))
    righe.push({
      voce: nome,
      atteso: round2(attesoVal || 0),
      pagato: round2(pagatoVal || 0),
      delta,
      ok: Math.abs(delta) < 0.005,
      testo: nota || null,
    })
  }

  confronta('Onorario (voce 40)', atteso.importi.onorario, somma((v) => v.codice === '40'))
  confronta('Incremento A.I.R. (voce 45)', atteso.importi.air, somma((v) => v.codice === '45'))
  confronta(
    'Reperibilità (voce 27)',
    atteso.importi.reperibilita,
    somma((v) => v.codice === '27'),
    atteso.reperibilita ? `${atteso.reperibilita} turni dichiarati` : null,
  )
  confronta(
    'Superfestivo (voce 46)',
    atteso.importi.superfestivo,
    somma((v) => v.codice === '46'),
    atteso.oreSuperfestive ? `${atteso.oreSuperfestive} ore in fascia maggiorata` : null,
  )

  // Benzina/chilometrico: il prezzo vero si conosce solo dal cedolino. Se
  // avevamo una stima la confrontiamo, ma la voce non fa mai scattare anomalie
  // gravi: il prezzo ricavato (importo/ore) va salvato per i mesi successivi.
  const pagatoKm = somma((v) => v.codice === '11')
  const prezzoRicavato = atteso.ore ? round2((pagatoKm / atteso.ore) * 100000) / 100000 : null
  righe.push({
    voce: 'Chilometrico (voce 11)',
    atteso: atteso.importi.benzina || null,
    pagato: pagatoKm,
    delta: atteso.importi.benzina ? round2(pagatoKm - atteso.importi.benzina) : null,
    ok: true,
    testo: prezzoRicavato ? `prezzo benzina ricavato: ${prezzoRicavato} €/L` : null,
  })

  const anomalie = righe.filter((r) => !r.ok).length
  return { righe, arretrati, anomalie, prezzoBenzinaRicavato: prezzoRicavato }
}

return {
  MESI,
  TIPI_TURNO,
  tipoTurno,
  daISO,
  aISO,
  giorniNelMese,
  mesePiu,
  etichettaMese,
  pasqua,
  festiviAnno,
  superfestiviAnno,
  oreSuperfestiveAuto,
  round2,
  numeroIt,
  euro,
  tariffaVigente,
  calcolaMese,
  rataDelMese,
  dataValuta,
  leggiCedolino,
  riconcilia,
}

})
