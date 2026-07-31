// CACCA Web — livello dati: Supabase (tabelle cacca_*) + Google Drive per i
// PDF dei cedolini + motore di calcolo condiviso. Stessa interfaccia che le
// pagine usavano nella versione desktop, così l'app resta identica.

// Il motore è un modulo "universale": l'import ne esegue il corpo, che si
// registra su globalThis (vedi src/lib/motore.cjs).
import './motore.cjs'
import { supabase } from './supabase'
import { caricaSuDrive, cartellaDatiCacca, linkCartellaDrive, linkDrive } from './drive'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const motore: any = (globalThis as { __motoreCACCA?: unknown }).__motoreCACCA

export type RispostaDb<T> = { data: T | null; error: { code?: string; message: string } | null }

export type Utente = {
  email: string
  nome: string | null
  cognome: string | null
  ruolo: 'admin'
  autorizzato: boolean
}

export type TipoTurnoCodice = 'nott12' | 'pref_g10' | 'pref22' | 'fest12' | 'fest24'

/** Le colonne del modello dell'ufficio (per l'interfaccia). */
export const TIPI_TURNO: {
  codice: TipoTurnoCodice
  nome: string
  breve: string
  ore: number
  colonna: string
}[] = [
  { codice: 'nott12', nome: 'Notturno infrasettimanale 12 ore', breve: 'Notte 12h', ore: 12, colonna: 'B' },
  { codice: 'pref_g10', nome: 'Prefestivo giorno 10 ore', breve: 'Prefest. giorno 10h', ore: 10, colonna: 'C' },
  { codice: 'pref22', nome: 'Prefestivo 22 ore', breve: 'Prefest. 22h', ore: 22, colonna: 'D' },
  { codice: 'fest12', nome: 'Festivo 12 ore', breve: 'Festivo 12h', ore: 12, colonna: 'E' },
  { codice: 'fest24', nome: 'Festivo 24 ore', breve: 'Festivo 24h', ore: 24, colonna: 'F' },
]

export type Postazione = {
  id: string
  nome: string
  nome_excel: string
  suffisso_foglio: string
  ordine: number
  attiva: boolean
  sede_cedolino: string | null
  turni: number
  reperibilita: number
}

export type Turno = { data: string; tipo: TipoTurnoCodice; superfestivo_ore: number; note: string | null }
export type Reperibilita = { data: string; quantita: number; note: string | null }
export type MeseTurni = { turni: Turno[]; reperibilita: Reperibilita[] }

export type Tariffa = { id: string; tipo: string; valore: number; dal: string; note: string | null }
export type PrezzoBenzina = { mese: string; prezzo: number; fonte: string | null }
export type Incarico = {
  id: string
  iscrizione: string
  dal: string | null
  al: string | null
  sede: string | null
  note: string | null
}

export type VoceCedolino = {
  codice: string
  descrizione: string | null
  qt: number | null
  uni: number | null
  rif: string | null
  importo: number | null
}

export type Cedolino = {
  id: string
  rata: string
  drive_file_id: string | null
  iscrizione: string | null
  sede: string | null
  lordo: number | null
  netto: number | null
  valuta: string | null
  anomalie_risolte: boolean
  voci: VoceCedolino[]
  enpam: { cassa: string; imponibile: number; aliquota: number; importo: number }[]
  ritenuta: { imponibile: number; importo: number } | null
  note: string | null
}

export type CalcoloMese = {
  mese: string
  ore: number
  oreSuperfestive: number
  turni: number
  reperibilita: number
  tariffe: { onorario: number; air: number; reperibilita: number; superfestivo: number; enpam: number; ra: number }
  benzinaPrezzo: number | null
  importi: { onorario: number; air: number; superfestivo: number; reperibilita: number; benzina: number }
  lordo: number
  enpam: number
  imponibile: number
  ritenuta: number
  netto: number
}

export type RaccoltaMese = {
  mese: string
  etichetta: string
  postazioni: { postazione: Postazione; calcolo: CalcoloMese }[]
  totale: CalcoloMese
  benzina: { prezzo: number | null; stimato: boolean; da?: string }
  rata: string
  valuta: string
}

export type RigaRiconciliazione = {
  voce: string
  atteso: number | null
  pagato: number | null
  delta: number | null
  ok: boolean
  testo: string | null
}

export type SuggerimentiCedolino = {
  sede: {
    sede: string
    candidato: { id: string; nome: string; somiglianza: number } | null
    postazioni: { id: string; nome: string }[]
    nomeProposto: string
  } | null
  iscrizione: { numero: string; dal: string; sede: string | null } | null
}

export type Riconciliazione = {
  cedolino: Cedolino
  meseLavoro: string
  etichettaMese: string
  atteso: RaccoltaMese
  righe: RigaRiconciliazione[]
  arretrati: VoceCedolino[]
  anomalie: number
  anomalieAperte: number
  anomalieRisolte: boolean
  prezzoBenzinaRicavato: number | null
  suggerimenti: SuggerimentiCedolino | null
  avvisoDrive?: string
}

// ---------------------------------------------------------------- utilità

function errore<T>(e: unknown): RispostaDb<T> {
  const m = e instanceof Error ? e.message : String(e)
  return { data: null, error: { message: m } }
}

async function esegui<T>(fn: () => Promise<T>): Promise<RispostaDb<T>> {
  try {
    return { data: await fn(), error: null }
  } catch (e) {
    return errore<T>(e)
  }
}

function pretendi<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

const n = (v: unknown): number => Number(v) || 0

// ---------------------------------------------------------------- letture di base

async function elencoPostazioni(): Promise<Postazione[]> {
  const [poste, turni, rep] = await Promise.all([
    supabase.from('cacca_postazioni').select('*').order('ordine').order('nome'),
    supabase.from('cacca_turni').select('postazione_id'),
    supabase.from('cacca_reperibilita').select('postazione_id, quantita'),
  ])
  const p = pretendi(poste) as Record<string, unknown>[]
  const contaT = new Map<string, number>()
  for (const t of pretendi(turni) as { postazione_id: string }[]) {
    contaT.set(t.postazione_id, (contaT.get(t.postazione_id) ?? 0) + 1)
  }
  const contaR = new Map<string, number>()
  for (const r of pretendi(rep) as { postazione_id: string; quantita: number }[]) {
    contaR.set(r.postazione_id, (contaR.get(r.postazione_id) ?? 0) + n(r.quantita))
  }
  return p.map((x) => ({
    id: String(x.id),
    nome: String(x.nome),
    nome_excel: String(x.nome_excel),
    suffisso_foglio: String(x.suffisso_foglio ?? ''),
    ordine: n(x.ordine),
    attiva: Boolean(x.attiva),
    sede_cedolino: (x.sede_cedolino as string) ?? null,
    turni: contaT.get(String(x.id)) ?? 0,
    reperibilita: contaR.get(String(x.id)) ?? 0,
  }))
}

async function turniDelMese(postazioneId: string, mese: string): Promise<MeseTurni> {
  const dal = `${mese}-01`
  const al = `${motore.mesePiu(mese, 1)}-01`
  const [t, r] = await Promise.all([
    supabase
      .from('cacca_turni')
      .select('data, tipo, superfestivo_ore, note')
      .eq('postazione_id', postazioneId)
      .gte('data', dal)
      .lt('data', al)
      .order('data'),
    supabase
      .from('cacca_reperibilita')
      .select('data, quantita, note')
      .eq('postazione_id', postazioneId)
      .gte('data', dal)
      .lt('data', al)
      .order('data'),
  ])
  return {
    turni: (pretendi(t) as Turno[]).map((x) => ({ ...x, superfestivo_ore: n(x.superfestivo_ore) })),
    reperibilita: (pretendi(r) as Reperibilita[]).map((x) => ({ ...x, quantita: n(x.quantita) })),
  }
}

async function tutteLeTariffe(): Promise<Tariffa[]> {
  const r = await supabase.from('cacca_tariffe').select('*').order('tipo').order('dal')
  return (pretendi(r) as Tariffa[]).map((t) => ({ ...t, valore: n(t.valore) }))
}

async function elencoBenzina(): Promise<PrezzoBenzina[]> {
  const r = await supabase.from('cacca_benzina').select('mese, prezzo, fonte').order('mese', { ascending: false })
  return (pretendi(r) as PrezzoBenzina[]).map((b) => ({ ...b, prezzo: n(b.prezzo) }))
}

function prezzoBenzinaDa(elenco: PrezzoBenzina[], mese: string) {
  const esatto = elenco.find((b) => b.mese === mese)
  if (esatto) return { prezzo: esatto.prezzo, stimato: /stima/i.test(esatto.fonte ?? '') }
  const prima = elenco.filter((b) => b.mese < mese).sort((a, b) => (a.mese < b.mese ? 1 : -1))[0]
  if (prima) return { prezzo: prima.prezzo, stimato: true, da: prima.mese }
  const dopo = elenco.filter((b) => b.mese > mese).sort((a, b) => (a.mese < b.mese ? -1 : 1))[0]
  if (dopo) return { prezzo: dopo.prezzo, stimato: true, da: dopo.mese }
  return { prezzo: null as number | null, stimato: true }
}

function cedolinoDaRiga(r: Record<string, unknown>): Cedolino {
  return {
    id: String(r.id),
    rata: String(r.rata),
    drive_file_id: (r.drive_file_id as string) ?? null,
    iscrizione: (r.iscrizione as string) ?? null,
    sede: (r.sede as string) ?? null,
    lordo: r.lordo === null ? null : n(r.lordo),
    netto: r.netto === null ? null : n(r.netto),
    valuta: (r.valuta as string) ?? null,
    anomalie_risolte: Boolean(r.anomalie_risolte),
    voci: (r.voci as VoceCedolino[]) ?? [],
    enpam: (r.enpam as Cedolino['enpam']) ?? [],
    ritenuta: (r.ritenuta as Cedolino['ritenuta']) ?? null,
    note: (r.note as string) ?? null,
  }
}

async function elencoCedolini(): Promise<Cedolino[]> {
  const r = await supabase.from('cacca_cedolini').select('*').order('rata', { ascending: false })
  return (pretendi(r) as Record<string, unknown>[]).map(cedolinoDaRiga)
}

// ---------------------------------------------------------------- calcoli

async function raccogliMese(mese: string): Promise<RaccoltaMese> {
  const [postazioni, tariffe, benzinaTutta] = await Promise.all([
    elencoPostazioni(),
    tutteLeTariffe(),
    elencoBenzina(),
  ])
  const benzina = prezzoBenzinaDa(benzinaTutta, mese)
  const attive = postazioni.filter((p) => p.attiva)
  const dettagli: { postazione: Postazione; calcolo: CalcoloMese }[] = []
  let turniTotali: Turno[] = []
  let repTotali: Reperibilita[] = []
  for (const p of attive) {
    const { turni, reperibilita } = await turniDelMese(p.id, mese)
    turniTotali = turniTotali.concat(turni)
    repTotali = repTotali.concat(reperibilita)
    dettagli.push({
      postazione: p,
      calcolo: motore.calcolaMese({ mese, turni, reperibilita, tariffe, benzinaPrezzo: benzina.prezzo }),
    })
  }
  const totale = motore.calcolaMese({
    mese,
    turni: turniTotali,
    reperibilita: repTotali,
    tariffe,
    benzinaPrezzo: benzina.prezzo,
  })
  const rata = motore.rataDelMese(mese)
  return {
    mese,
    etichetta: motore.etichettaMese(mese),
    postazioni: dettagli,
    totale,
    benzina,
    rata,
    valuta: motore.dataValuta(rata),
  }
}

function rifDiMese(mese: string): string {
  const [a, m] = String(mese).split('-')
  return `${m}/${a.slice(2)}`
}

async function riconciliaCedolino(ced: Cedolino): Promise<Riconciliazione> {
  const meseLavoro = motore.mesePiu(ced.rata, -1)
  const atteso = await raccogliMese(meseLavoro)
  const esito = motore.riconcilia(atteso.totale, ced)

  // una voce "mancante" può essere stata pagata in ritardo in una rata
  // successiva (compare lì con "Rif MM/AA"): non è un'anomalia
  const codici: Record<string, string> = {
    'Onorario (voce 40)': '40',
    'Incremento A.I.R. (voce 45)': '45',
    'Reperibilità (voce 27)': '27',
    'Superfestivo (voce 46)': '46',
  }
  const rifAttesi = [rifDiMese(meseLavoro), rifDiMese(ced.rata)]
  const successivi = (await elencoCedolini()).filter((c) => c.rata > ced.rata).sort((a, b) => (a.rata < b.rata ? -1 : 1))
  for (const r of esito.righe as RigaRiconciliazione[]) {
    if (r.ok || (r.delta ?? 0) >= 0) continue
    const codice = codici[r.voce]
    if (!codice) continue
    for (const s of successivi) {
      const recupero = s.voci
        .filter((v) => v.codice === codice && v.rif && rifAttesi.includes(v.rif))
        .reduce((acc, v) => acc + (v.importo ?? 0), 0)
      if (recupero > 0 && Math.abs(recupero + (r.delta ?? 0)) < 0.005) {
        r.ok = true
        r.testo = `${r.testo ? r.testo + ' — ' : ''}pagata in ritardo nella rata ${s.rata} (arretrato ${motore.euro(recupero)} €)`
        break
      }
    }
  }
  const anomalie = (esito.righe as RigaRiconciliazione[]).filter((x) => !x.ok).length
  return {
    cedolino: ced,
    meseLavoro,
    etichettaMese: motore.etichettaMese(meseLavoro),
    atteso,
    righe: esito.righe,
    arretrati: esito.arretrati,
    anomalie,
    anomalieAperte: ced.anomalie_risolte ? 0 : anomalie,
    anomalieRisolte: ced.anomalie_risolte,
    prezzoBenzinaRicavato: esito.prezzoBenzinaRicavato ?? null,
    suggerimenti: await suggerimentiDaCedolino(ced),
  }
}

/** Sede e iscrizione lette dal PDF: se sconosciute, si prepara la domanda. */
async function suggerimentiDaCedolino(ced: Cedolino): Promise<SuggerimentiCedolino | null> {
  const esito: SuggerimentiCedolino = { sede: null, iscrizione: null }
  const postazioni = await elencoPostazioni()

  if (ced.sede) {
    const trovata = motore.cercaPostazionePerSede(ced.sede, postazioni)
    if (!trovata.esatta) {
      esito.sede = {
        sede: ced.sede,
        candidato: trovata.postazione
          ? { id: trovata.postazione.id, nome: trovata.postazione.nome, somiglianza: trovata.somiglianza }
          : null,
        postazioni: postazioni.map((p) => ({ id: p.id, nome: p.nome })),
        nomeProposto: nomeLeggibile(ced.sede),
      }
    }
  }
  if (ced.iscrizione) {
    const r = await supabase.from('cacca_incarichi').select('id').eq('iscrizione', ced.iscrizione).limit(1)
    if (!pretendi(r as never as { data: unknown[]; error: null }).length) {
      esito.iscrizione = { numero: ced.iscrizione, dal: motore.mesePiu(ced.rata, -1), sede: ced.sede }
    }
  }
  return esito.sede || esito.iscrizione ? esito : null
}

/** "PALOMBARA (PPI)" → "Palombara (PPI)". */
function nomeLeggibile(sede: string): string {
  return String(sede || '')
    .toLowerCase()
    .replace(/\b[a-zàèéìòù]/g, (c) => c.toUpperCase())
    .replace(/\(([^)]*)\)/g, (_t, dentro: string) => `(${dentro.toUpperCase()})`)
    .trim()
}

/** Ogni mese con turni o cedolini deve avere il suo prezzo benzina. */
async function completaBenzina(): Promise<{ mese: string; prezzo: number; esatto: boolean }[]> {
  const [turniR, cedolini, benzina] = await Promise.all([
    supabase.from('cacca_turni').select('data, tipo'),
    elencoCedolini(),
    elencoBenzina(),
  ])
  const turni = pretendi(turniR) as { data: string; tipo: string }[]
  const mesi = new Set<string>()
  for (const t of turni) mesi.add(t.data.slice(0, 7))
  for (const c of cedolini) mesi.add(motore.mesePiu(c.rata, -1))

  const orePerMese = (mese: string) =>
    turni
      .filter((t) => t.data.startsWith(mese))
      .reduce((acc, t) => acc + (motore.tipoTurno(t.tipo)?.ore ?? 0), 0)

  const sistemati: { mese: string; prezzo: number; esatto: boolean }[] = []
  for (const mese of Array.from(mesi).sort()) {
    const ced = cedolini.find((c) => c.rata === motore.mesePiu(mese, 1))
    if (ced) {
      const km = ced.voci
        .filter((v) => v.codice === '11' && !v.rif)
        .reduce((acc, v) => acc + (v.importo ?? 0), 0)
      const ore = orePerMese(mese)
      if (km > 0 && ore > 0) {
        const prezzo = Math.round((km / ore) * 100000) / 100000
        const attuale = benzina.find((b) => b.mese === mese)
        if (!attuale || attuale.prezzo !== prezzo || /stima/i.test(attuale.fonte ?? '')) {
          pretendi(
            await supabase.from('cacca_benzina').upsert(
              { mese, prezzo, fonte: `ricavato dal cedolino di ${motore.etichettaMese(ced.rata)}` },
              { onConflict: 'utente,mese' },
            ),
          )
          sistemati.push({ mese, prezzo, esatto: true })
        }
        continue
      }
    }
    if (benzina.find((b) => b.mese === mese)) continue
    const noti = benzina.filter((b) => !/stima/i.test(b.fonte ?? ''))
    const vicino =
      noti.filter((b) => b.mese < mese).sort((a, b) => (a.mese < b.mese ? 1 : -1))[0] ??
      noti.filter((b) => b.mese > mese).sort((a, b) => (a.mese < b.mese ? -1 : 1))[0]
    if (!vicino) continue
    pretendi(
      await supabase.from('cacca_benzina').upsert(
        { mese, prezzo: vicino.prezzo, fonte: `stima (ultimo prezzo noto: ${motore.etichettaMese(vicino.mese)})` },
        { onConflict: 'utente,mese' },
      ),
    )
    sistemati.push({ mese, prezzo: vicino.prezzo, esatto: false })
  }
  return sistemati
}

// ---------------------------------------------------------------- lettura PDF nel browser

async function estraiTestoPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pagine: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i)
    const contenuto = await pagina.getTextContent()
    // si ricostruiscono le righe raggruppando i frammenti per posizione verticale
    const righe = new Map<number, { x: number; testo: string }[]>()
    for (const item of contenuto.items as { str: string; transform: number[] }[]) {
      if (!item.str || !item.str.trim()) continue
      const y = Math.round(item.transform[5])
      const elenco = righe.get(y) ?? []
      elenco.push({ x: item.transform[4], testo: item.str })
      righe.set(y, elenco)
    }
    const ordinate = Array.from(righe.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, pezzi]) =>
        pezzi
          .sort((a, b) => a.x - b.x)
          .map((p) => p.testo)
          .join(' '),
      )
    pagine.push(ordinate.join('\n'))
  }
  return pagine.join('\n')
}

// ---------------------------------------------------------------- interfaccia

export const dbLocale = {
  auth: {
    async utente(): Promise<Utente | null> {
      const { data } = await supabase.auth.getSession()
      const email = data.session?.user?.email?.toLowerCase()
      if (!email) return null
      const [aut, prefs] = await Promise.all([
        supabase.from('cacca_autorizzati').select('email').limit(1),
        supabase.from('cacca_preferenze').select('chiave, valore').in('chiave', ['nome', 'cognome']),
      ])
      const autorizzato = !aut.error && (aut.data ?? []).length > 0
      const p = new Map(((prefs.data as { chiave: string; valore: string }[]) ?? []).map((x) => [x.chiave, x.valore]))
      return {
        email,
        nome: p.get('nome') ?? null,
        cognome: p.get('cognome') ?? null,
        ruolo: 'admin',
        autorizzato,
      }
    },
    async accediConGoogle(): Promise<RispostaDb<null>> {
      return esegui(async () => {
        const redirectTo = window.location.origin + window.location.pathname
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, queryParams: { prompt: 'select_account' } },
        })
        if (error) throw new Error(error.message)
        return null
      })
    },
    async esci(): Promise<void> {
      await supabase.auth.signOut()
    },
    osserva(callback: () => void): () => void {
      const { data } = supabase.auth.onAuthStateChange(() => callback())
      return () => data.subscription.unsubscribe()
    },
    async salvaProfilo(nome: string | null, cognome: string | null): Promise<RispostaDb<null>> {
      return esegui(async () => {
        pretendi(
          await supabase
            .from('cacca_preferenze')
            .upsert([{ chiave: 'nome', valore: nome }, { chiave: 'cognome', valore: cognome }], {
              onConflict: 'utente,chiave',
            }),
        )
        return null
      })
    },
  },

  preferenze: {
    tutte: () =>
      esegui(async () => {
        const r = await supabase.from('cacca_preferenze').select('chiave, valore')
        const out: Record<string, string> = {}
        for (const x of pretendi(r) as { chiave: string; valore: string | null }[]) {
          if (x.valore !== null) out[x.chiave] = x.valore
        }
        return out
      }),
    imposta: (chiave: string, valore: string | null) =>
      esegui(async () => {
        pretendi(await supabase.from('cacca_preferenze').upsert({ chiave, valore }, { onConflict: 'utente,chiave' }))
        return null
      }),
  },

  postazioni: {
    list: () => esegui(elencoPostazioni),
    salva: (r: Partial<Postazione>) =>
      esegui(async () => {
        const nome = r.nome?.trim()
        const nomeExcel = r.nome_excel?.trim()
        if (!nome || !nomeExcel) throw new Error("Il nome e l'intestazione del foglio excel sono obbligatori.")
        const campi = {
          nome,
          nome_excel: nomeExcel,
          suffisso_foglio: r.suffisso_foglio ?? '',
          ordine: r.ordine ?? 0,
          attiva: r.attiva !== false,
          sede_cedolino: r.sede_cedolino?.trim() || null,
        }
        if (r.id) {
          pretendi(await supabase.from('cacca_postazioni').update(campi).eq('id', r.id))
          return { id: r.id }
        }
        const max = (await elencoPostazioni()).reduce((m, p) => Math.max(m, p.ordine), 0)
        const ins = await supabase
          .from('cacca_postazioni')
          .insert({ ...campi, ordine: r.ordine ?? max + 1 })
          .select('id')
          .single()
        return { id: String(pretendi(ins as never as { data: { id: string }; error: null }).id) }
      }),
    elimina: (id: string) =>
      esegui(async () => {
        const p = (await elencoPostazioni()).find((x) => x.id === id)
        if (!p) throw new Error('Postazione non trovata.')
        if (p.turni + p.reperibilita > 0) {
          throw new Error(
            `«${p.nome}» non si può eliminare: contiene ${p.turni} turni e ${p.reperibilita} reperibilità. ` +
              'Se non la usi più, toglile la spunta «attiva»: sparisce dai calendari ma lo storico resta.',
          )
        }
        pretendi(await supabase.from('cacca_postazioni').delete().eq('id', id))
        return null
      }),
  },

  turni: {
    mese: (postazioneId: string, mese: string) => esegui(() => turniDelMese(postazioneId, mese)),
    imposta: (r: {
      data: string
      postazioneId: string
      tipi: { tipo: TipoTurnoCodice; superfestivoOre?: number | null; note?: string | null }[]
    }) =>
      esegui(async () => {
        pretendi(
          await supabase.from('cacca_turni').delete().eq('data', r.data).eq('postazione_id', r.postazioneId),
        )
        const salvati: { tipo: TipoTurnoCodice; superfestivoOre: number }[] = []
        if (r.tipi.length) {
          const righe = r.tipi.map((t) => {
            const sf =
              t.superfestivoOre === null || t.superfestivoOre === undefined
                ? (motore.oreSuperfestiveAuto(r.data, t.tipo) as number)
                : Math.max(0, Number(t.superfestivoOre) || 0)
            salvati.push({ tipo: t.tipo, superfestivoOre: sf })
            return {
              data: r.data,
              postazione_id: r.postazioneId,
              tipo: t.tipo,
              superfestivo_ore: sf,
              note: t.note ?? null,
            }
          })
          pretendi(await supabase.from('cacca_turni').insert(righe))
        }
        return { tipi: salvati }
      }),
    repImposta: (r: { data: string; postazioneId: string; quantita: number }) =>
      esegui(async () => {
        if (!r.quantita) {
          pretendi(
            await supabase.from('cacca_reperibilita').delete().eq('data', r.data).eq('postazione_id', r.postazioneId),
          )
          return null
        }
        pretendi(
          await supabase
            .from('cacca_reperibilita')
            .upsert(
              { data: r.data, postazione_id: r.postazioneId, quantita: Math.min(2, r.quantita) },
              { onConflict: 'utente,data,postazione_id' },
            ),
        )
        return null
      }),
    propostaSuperfestivo: (data: string, tipo: TipoTurnoCodice) =>
      esegui(async () => motore.oreSuperfestiveAuto(data, tipo) as number),
  },

  calcoli: {
    mese: (mese: string) => esegui(() => raccogliMese(mese)),
    mesiDisponibili: () =>
      esegui(async () => {
        const r = await supabase.from('cacca_turni').select('data')
        const insieme = new Set((pretendi(r) as { data: string }[]).map((x) => x.data.slice(0, 7)))
        return Array.from(insieme).sort()
      }),
  },

  excel: {
    genera: (postazioneId: string, mese: string, formato: 'xlsx' | 'pdf') =>
      esegui(async () => {
        const { generaRiepilogo } = await import('./riepilogo')
        const [postazioni, utente] = await Promise.all([elencoPostazioni(), dbLocale.auth.utente()])
        const p = postazioni.find((x) => x.id === postazioneId)
        if (!p) throw new Error('Postazione non trovata.')
        const dati = await turniDelMese(postazioneId, mese)
        return generaRiepilogo({
          mese,
          postazione: p,
          medico: { cognome: utente?.cognome ?? '', nome: utente?.nome ?? '' },
          ...dati,
          formato,
        })
      }),
  },

  cedolini: {
    list: () => esegui(elencoCedolini),
    riconcilia: (id: string) =>
      esegui(async () => {
        const r = await supabase.from('cacca_cedolini').select('*').eq('id', id).single()
        return riconciliaCedolino(cedolinoDaRiga(pretendi(r) as Record<string, unknown>))
      }),
    importa: (file: File) =>
      esegui(async () => {
        const testo = await estraiTestoPdf(file)
        const letto = motore.leggiCedolino(testo)
        if (!letto.rata) {
          throw new Error('Questo PDF non sembra un cedolino NoiPA: non trovo la rata (mese/anno).')
        }
        // il PDF va sul TUO Drive, nella cartella DATI CACCA
        let driveId: string | null = null
        let avvisoDrive: string | undefined
        try {
          driveId = await caricaSuDrive(file, `cedolino-${letto.rata}.pdf`)
        } catch (e) {
          avvisoDrive = `Cedolino registrato, ma il PDF non è stato caricato su Drive: ${e instanceof Error ? e.message : e}`
        }
        const riga = {
          rata: letto.rata,
          drive_file_id: driveId,
          drive_file_nome: `cedolino-${letto.rata}.pdf`,
          iscrizione: letto.iscrizione,
          sede: letto.sede,
          lordo: letto.totaleCompetenze,
          netto: letto.netto,
          valuta: letto.valuta,
          voci: letto.voci,
          enpam: letto.enpam,
          ritenuta: letto.ritenuta,
        }
        const ins = await supabase
          .from('cacca_cedolini')
          .upsert(riga, { onConflict: 'utente,rata' })
          .select('*')
          .single()
        const salvato = cedolinoDaRiga(pretendi(ins) as Record<string, unknown>)
        await completaBenzina()
        const esito = await riconciliaCedolino(salvato)
        return { ...esito, avvisoDrive }
      }),
    collegaSede: (r: {
      sede: string
      postazioneId?: string
      creaNuova?: boolean
      nome?: string
      allineaNome?: boolean
    }) =>
      esegui(async () => {
        const sede = r.sede.trim()
        if (!sede) throw new Error('Sede non indicata.')
        if (r.creaNuova) {
          const nome = r.nome?.trim() || nomeLeggibile(sede)
          const max = (await elencoPostazioni()).reduce((m, p) => Math.max(m, p.ordine), 0)
          const ins = await supabase
            .from('cacca_postazioni')
            .insert({ nome, nome_excel: sede.toUpperCase(), ordine: max + 1, sede_cedolino: sede })
            .select('id')
            .single()
          return { id: String((pretendi(ins) as { id: string }).id), nome, creata: true }
        }
        if (!r.postazioneId) throw new Error('Postazione non indicata.')
        if (r.allineaNome) {
          const nome = nomeLeggibile(sede)
          pretendi(
            await supabase
              .from('cacca_postazioni')
              .update({ nome, nome_excel: sede.toUpperCase(), sede_cedolino: sede })
              .eq('id', r.postazioneId),
          )
          return { id: r.postazioneId, nome, creata: false }
        }
        pretendi(await supabase.from('cacca_postazioni').update({ sede_cedolino: sede }).eq('id', r.postazioneId))
        const p = (await elencoPostazioni()).find((x) => x.id === r.postazioneId)
        return { id: r.postazioneId, nome: p?.nome ?? '', creata: false }
      }),
    risolviAnomalie: (id: string, risolte: boolean) =>
      esegui(async () => {
        pretendi(await supabase.from('cacca_cedolini').update({ anomalie_risolte: risolte }).eq('id', id))
        return null
      }),
    apri: (id: string) =>
      esegui(async () => {
        const r = await supabase.from('cacca_cedolini').select('drive_file_id').eq('id', id).single()
        const fileId = (pretendi(r) as { drive_file_id: string | null }).drive_file_id
        if (!fileId) throw new Error('Il PDF di questo cedolino non è su Drive: reimportalo per caricarlo.')
        window.open(linkDrive(fileId), '_blank', 'noopener')
        return null
      }),
    elimina: (id: string) =>
      esegui(async () => {
        pretendi(await supabase.from('cacca_cedolini').delete().eq('id', id))
        return null
      }),
  },

  benzina: {
    list: () => esegui(elencoBenzina),
    completa: () => esegui(completaBenzina),
  },

  tariffe: {
    list: () => esegui(tutteLeTariffe),
    salva: (r: Partial<Tariffa>) =>
      esegui(async () => {
        const valore = Number(r.valore)
        if (!Number.isFinite(valore)) throw new Error('Valore non valido.')
        if (!/^\d{4}-\d{2}$/.test(String(r.dal))) throw new Error("Decorrenza non valida (usa l'anno-mese).")
        if (r.id) {
          pretendi(
            await supabase.from('cacca_tariffe').update({ valore, dal: r.dal, note: r.note ?? null }).eq('id', r.id),
          )
        } else {
          pretendi(
            await supabase
              .from('cacca_tariffe')
              .upsert({ tipo: r.tipo, valore, dal: r.dal, note: r.note ?? null }, { onConflict: 'utente,tipo,dal' }),
          )
        }
        return null
      }),
    elimina: (id: string) =>
      esegui(async () => {
        pretendi(await supabase.from('cacca_tariffe').delete().eq('id', id))
        return null
      }),
  },

  incarichi: {
    list: () =>
      esegui(async () => {
        const r = await supabase.from('cacca_incarichi').select('*').order('dal', { ascending: false })
        return pretendi(r) as Incarico[]
      }),
    salva: (r: Partial<Incarico>) =>
      esegui(async () => {
        const iscrizione = r.iscrizione?.trim()
        if (!iscrizione) throw new Error('Numero di iscrizione obbligatorio.')
        const campi = { iscrizione, dal: r.dal || null, al: r.al || null, sede: r.sede || null, note: r.note || null }
        if (r.id) pretendi(await supabase.from('cacca_incarichi').update(campi).eq('id', r.id))
        else pretendi(await supabase.from('cacca_incarichi').insert(campi))
        return null
      }),
    elimina: (id: string) =>
      esegui(async () => {
        pretendi(await supabase.from('cacca_incarichi').delete().eq('id', id))
        return null
      }),
  },

  datiApp: {
    apriCartellaDrive: () =>
      esegui(async () => {
        const id = await cartellaDatiCacca()
        window.open(linkCartellaDrive(id), '_blank', 'noopener')
        return null
      }),
    esporta: () =>
      esegui(async () => {
        const [postazioni, tariffe, benzina, incarichi, cedolini] = await Promise.all([
          elencoPostazioni(),
          tutteLeTariffe(),
          elencoBenzina(),
          supabase.from('cacca_incarichi').select('*'),
          elencoCedolini(),
        ])
        const [turni, rep] = await Promise.all([
          supabase.from('cacca_turni').select('*'),
          supabase.from('cacca_reperibilita').select('*'),
        ])
        const pacchetto = {
          formato: 'cacca-dati-web-1',
          esportato_il: new Date().toISOString(),
          postazioni,
          turni: pretendi(turni),
          reperibilita: pretendi(rep),
          tariffe,
          benzina,
          incarichi: pretendi(incarichi),
          cedolini,
        }
        const blob = new Blob([JSON.stringify(pacchetto, null, 1)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `CACCA-dati-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(a.href)
        return { file: a.download }
      }),
  },
}

export type ApiCacca = typeof dbLocale
