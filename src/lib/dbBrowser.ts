// Versione DIMOSTRATIVA per il browser (solo sviluppo dell'interfaccia):
// stessa interfaccia del ponte Electron, dati finti in memoria. Riusa il
// motore di calcolo vero (electron/motore.cjs), così i numeri mostrati in
// anteprima sono calcolati con le stesse regole dell'app.

// Il motore è un modulo "universale": l'import ne esegue il corpo, che si
// registra su globalThis (vedi electron/motore.cjs).
import '../../electron/motore.cjs'
import type {
  ApiCacca,
  Cedolino,
  Postazione,
  RispostaDb,
  Tariffa,
  TipoTurnoCodice,
  Utente,
} from './db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const motore: any = (globalThis as { __motoreCACCA?: unknown }).__motoreCACCA

function ok<T>(data: T): Promise<RispostaDb<T>> {
  return Promise.resolve({ data, error: null })
}

function err<T>(message: string): Promise<RispostaDb<T>> {
  return Promise.resolve({ data: null, error: { message } })
}

export function creaApiBrowser(): ApiCacca {
  console.log('[CACCA] modalità browser dimostrativa (nessun ponte Electron)')

  let sessione: Utente | null = null
  const preferenze: Record<string, string> = {}

  const postazioni: Postazione[] = [
    { id: 'p1', nome: 'Guidonia / Palombara Giorno', nome_excel: 'GUIDONIA/PALOMBARA GIORNO', suffisso_foglio: '', ordine: 1, attiva: true, sede_cedolino: null, turni: 2, reperibilita: 1 },
    { id: 'p2', nome: 'Palombara Notte', nome_excel: 'PALOMBARA NOTTE', suffisso_foglio: ' PALOMBARA', ordine: 2, attiva: true, sede_cedolino: null, turni: 2, reperibilita: 0 },
  ]

  const tariffe: Tariffa[] = [
    { id: 't1', tipo: 'onorario', valore: 24.25, dal: '2000-01', note: 'ACN 4/4/2024' },
    { id: 't2', tipo: 'onorario', valore: 25.1, dal: '2026-02', note: 'ACN 15/1/2026' },
    { id: 't3', tipo: 'air_ora', valore: 5.0, dal: '2000-01', note: 'A.I.R. Lazio' },
    { id: 't4', tipo: 'reperibilita', valore: 35.09, dal: '2000-01', note: 'A.I.R. Lazio' },
    { id: 't5', tipo: 'superfestivo_ora', valore: 15.0, dal: '2000-01', note: 'AIR art. 23' },
    { id: 't6', tipo: 'enpam_pct', valore: 15.625, dal: '2000-01', note: null },
    { id: 't7', tipo: 'ra_pct', valore: 20.0, dal: '2000-01', note: null },
  ]

  const benzina: { mese: string; prezzo: number; fonte: string | null }[] = [
    { mese: '2026-06', prezzo: 1.93111, fonte: 'demo' },
  ]

  // turni dimostrativi nel mese corrente (chiave: postazione|data|tipo)
  const oggi = new Date()
  const meseDemo = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`
  const turni = new Map<string, { tipo: TipoTurnoCodice; superfestivo_ore: number; note: string | null }>()
  const reperibilita = new Map<string, { quantita: number; note: string | null }>()
  const gDemo = (g: number) => `${meseDemo}-${String(g).padStart(2, '0')}`
  turni.set(`p1|${gDemo(3)}|nott12`, { tipo: 'nott12', superfestivo_ore: 0, note: null })
  turni.set(`p1|${gDemo(11)}|pref_g10`, { tipo: 'pref_g10', superfestivo_ore: 0, note: null })
  turni.set(`p2|${gDemo(6)}|nott12`, { tipo: 'nott12', superfestivo_ore: 0, note: null })
  turni.set(`p2|${gDemo(14)}|nott12`, { tipo: 'nott12', superfestivo_ore: 0, note: null })
  reperibilita.set(`p1|${gDemo(20)}`, { quantita: 1, note: null })

  const cedolini: Cedolino[] = []

  function prezzoBenzina(mese: string) {
    const esatto = benzina.find((b) => b.mese === mese)
    if (esatto) return { prezzo: esatto.prezzo, stimato: false }
    const prima = benzina.filter((b) => b.mese < mese).sort((a, b) => (a.mese < b.mese ? 1 : -1))[0]
    if (prima) return { prezzo: prima.prezzo, stimato: true, da: prima.mese }
    return { prezzo: null, stimato: true }
  }

  function turniMese(postazioneId: string, mese: string) {
    const t: { data: string; tipo: TipoTurnoCodice; superfestivo_ore: number; note: string | null }[] = []
    const r: { data: string; quantita: number; note: string | null }[] = []
    for (const [k, v] of turni) {
      const [p, data] = k.split('|')
      if (p === postazioneId && data.startsWith(mese)) t.push({ data, tipo: v.tipo, superfestivo_ore: v.superfestivo_ore, note: v.note })
    }
    for (const [k, v] of reperibilita) {
      const [p, data] = k.split('|')
      if (p === postazioneId && data.startsWith(mese)) r.push({ data, ...v })
    }
    t.sort((a, b) => (a.data < b.data ? -1 : 1))
    r.sort((a, b) => (a.data < b.data ? -1 : 1))
    return { turni: t, reperibilita: r }
  }

  function raccogliMese(mese: string) {
    const b = prezzoBenzina(mese)
    const dettagli = postazioni.map((p) => {
      const { turni: t, reperibilita: r } = turniMese(p.id, mese)
      return {
        postazione: p,
        calcolo: motore.calcolaMese({ mese, turni: t, reperibilita: r, tariffe, benzinaPrezzo: b.prezzo }),
      }
    })
    const tuttiT = dettagli.flatMap((d, i) => turniMese(postazioni[i].id, mese).turni)
    const tuttiR = dettagli.flatMap((d, i) => turniMese(postazioni[i].id, mese).reperibilita)
    const totale = motore.calcolaMese({ mese, turni: tuttiT, reperibilita: tuttiR, tariffe, benzinaPrezzo: b.prezzo })
    const rata = motore.rataDelMese(mese)
    return {
      mese,
      etichetta: motore.etichettaMese(mese),
      postazioni: dettagli,
      totale,
      benzina: b,
      rata,
      valuta: motore.dataValuta(rata),
    }
  }

  const utenteDemo = (email: string): Utente => ({
    id: 'demo',
    nome: 'Demo',
    cognome: 'Browser',
    email,
    ruolo: 'admin',
    attivo: true,
    permanente: false,
  })

  return {
    auth: {
      stato: () => ok({ serveSetup: false, utente: sessione }),
      setup: (r) => {
        sessione = utenteDemo(r.email)
        return ok(sessione)
      },
      login: (email, password) => {
        if (!email || !password) return err('Inserisci nome utente e password (demo: qualsiasi valore).')
        sessione = utenteDemo(email)
        return ok(sessione)
      },
      logout: () => {
        sessione = null
        return ok(null)
      },
      cambiaPassword: () => ok(null),
    },
    utenti: {
      list: () => ok(sessione ? [sessione] : []),
      insert: () => err('Disponibile solo dentro CACCA.exe'),
      update: () => ok(null),
      resetPassword: () => err('Disponibile solo dentro CACCA.exe'),
      remove: () => err('Disponibile solo dentro CACCA.exe'),
    },
    preferenze: {
      tutte: () => ok({ ...preferenze }),
      imposta: (chiave, valore) => {
        if (valore === null) delete preferenze[chiave]
        else preferenze[chiave] = valore
        return ok(null)
      },
    },
    postazioni: {
      list: () => ok(postazioni.slice()),
      salva: () => err<{ id: string }>('Disponibile solo dentro CACCA.exe'),
      elimina: () => err('Disponibile solo dentro CACCA.exe'),
    },
    turni: {
      mese: (postazioneId, mese) => ok(turniMese(postazioneId, mese)),
      imposta: (r) => {
        for (const k of Array.from(turni.keys())) {
          if (k.startsWith(`${r.postazioneId}|${r.data}|`)) turni.delete(k)
        }
        const salvati: { tipo: TipoTurnoCodice; superfestivoOre: number }[] = []
        for (const t of r.tipi) {
          const sf =
            t.superfestivoOre === null || t.superfestivoOre === undefined
              ? (motore.oreSuperfestiveAuto(r.data, t.tipo) as number)
              : Math.max(0, Number(t.superfestivoOre) || 0)
          turni.set(`${r.postazioneId}|${r.data}|${t.tipo}`, { tipo: t.tipo, superfestivo_ore: sf, note: t.note ?? null })
          salvati.push({ tipo: t.tipo, superfestivoOre: sf })
        }
        return ok({ tipi: salvati })
      },
      repImposta: (r) => {
        const k = `${r.postazioneId}|${r.data}`
        if (!r.quantita) reperibilita.delete(k)
        else reperibilita.set(k, { quantita: Math.min(2, r.quantita), note: null })
        return ok(null)
      },
      propostaSuperfestivo: (data, tipo) => ok(motore.oreSuperfestiveAuto(data, tipo) as number),
    },
    calcoli: {
      mese: (mese) => ok(raccogliMese(mese) as never),
      anno: (anno) => {
        const mesi = []
        const somma = { ore: 0, lordo: 0, enpam: 0, ritenuta: 0, netto: 0, reperibilita: 0 }
        for (let m = 1; m <= 12; m++) {
          const mese = `${anno}-${String(m).padStart(2, '0')}`
          const r = raccogliMese(mese)
          if (r.totale.ore === 0 && r.totale.reperibilita === 0) continue
          mesi.push({ mese, etichetta: r.etichetta, totale: r.totale, rata: r.rata, valuta: r.valuta, cedolino: null })
          somma.ore += r.totale.ore
          somma.lordo += r.totale.lordo
          somma.enpam += r.totale.enpam
          somma.ritenuta += r.totale.ritenuta
          somma.netto += r.totale.netto
          somma.reperibilita += r.totale.reperibilita
        }
        return ok({ anno, mesi, somma } as never)
      },
      mesiDisponibili: () => ok([meseDemo]),
    },
    excel: {
      genera: () => err('La generazione del file excel è disponibile solo dentro CACCA.exe'),
    },
    cedolini: {
      list: () => ok(cedolini.slice()),
      importa: () => err("L'importazione dei cedolini è disponibile solo dentro CACCA.exe"),
      riconcilia: () => err('Disponibile solo dentro CACCA.exe'),
      collegaSede: () => err<{ id: string; nome: string; creata: boolean }>('Disponibile solo dentro CACCA.exe'),
      apri: () => err('Disponibile solo dentro CACCA.exe'),
      elimina: () => err('Disponibile solo dentro CACCA.exe'),
    },
    benzina: {
      list: () => ok(benzina.slice().sort((a, b) => (a.mese < b.mese ? 1 : -1))),
      imposta: (mese, prezzo) => {
        const i = benzina.findIndex((b) => b.mese === mese)
        if (prezzo === 0) {
          if (i >= 0) benzina.splice(i, 1)
        } else if (i >= 0) benzina[i] = { mese, prezzo, fonte: 'inserito a mano' }
        else benzina.push({ mese, prezzo, fonte: 'inserito a mano' })
        return ok(null)
      },
    },
    tariffe: {
      list: () => ok(tariffe.slice()),
      salva: () => err('Disponibile solo dentro CACCA.exe'),
      elimina: () => err('Disponibile solo dentro CACCA.exe'),
    },
    incarichi: {
      list: () => ok([]),
      salva: () => err('Disponibile solo dentro CACCA.exe'),
      elimina: () => err('Disponibile solo dentro CACCA.exe'),
    },
    datiApp: {
      info: () => ok({ cartella: '(anteprima nel browser: nessun archivio su disco)', dimensione: 0 }),
      esporta: () => err('Disponibile solo dentro CACCA.exe'),
      apriCartella: () => err('Disponibile solo dentro CACCA.exe'),
    },
    sistemazione: {
      stato: () => ok({ serve: false, posizioneAttuale: '', destinazione: '' }),
      scegliCartella: () => err<string | null>('Disponibile solo dentro CACCA.exe'),
      esegui: () => err('Disponibile solo dentro CACCA.exe'),
      rifiuta: () => ok(null),
    },
    collegamenti: {
      stato: () => ok({ desktop: false, menuAvvio: false, giaChiesto: true }),
      crea: () => err('Disponibile solo dentro CACCA.exe'),
      rimanda: () => ok(null),
      mostraCartella: () => err('Disponibile solo dentro CACCA.exe'),
    },
    aggiornamenti: {
      stato: () =>
        ok({
          supportato: false,
          versioneCorrente: __APP_VERSION__,
          fase: 'inattivo',
          percentuale: 0,
          disponibile: null,
          messaggio: '',
        }),
      controlla: () => ok(null),
      installa: () => err('Disponibile solo dentro CACCA.exe'),
      osserva: () => () => undefined,
    },
    versione: () => Promise.resolve(__APP_VERSION__),
  }
}
