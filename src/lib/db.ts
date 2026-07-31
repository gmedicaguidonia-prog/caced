import { creaApiBrowser } from './dbBrowser'

export type RispostaDb<T> = { data: T | null; error: { code?: string; message: string } | null }

export type Utente = {
  id: string
  nome: string | null
  cognome: string | null
  email: string
  ruolo: 'admin' | 'utente'
  attivo: boolean
  creato_il?: string
  /** true per l'amministratore permanente (non eliminabile né declassabile) */
  permanente?: boolean
}

export type NuovoUtente = {
  nome: string | null
  cognome: string | null
  email: string
  password: string
  ruolo?: 'admin' | 'utente'
}

export type StatoAuth = { serveSetup: boolean; utente: Utente | null }

export type Postazione = {
  id: string
  nome: string
  nome_excel: string
  suffisso_foglio: string
  ordine: number
  attiva: boolean
  /** com'è scritta la sede nei cedolini di questa postazione (imparata una volta) */
  sede_cedolino: string | null
  /** quanti turni/reperibilità la usano (per capire se è eliminabile) */
  turni: number
  reperibilita: number
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
  file: string | null
  iscrizione: string | null
  sede: string | null
  lordo: number | null
  netto: number | null
  valuta: string | null
  voci: VoceCedolino[]
  enpam: { cassa: string; imponibile: number; aliquota: number; importo: number }[]
  ritenuta: { imponibile: number; importo: number } | null
  importato_il?: string
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

/** Domande che nascono dal cedolino: sede sconosciuta, incarico nuovo. */
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
  prezzoBenzinaRicavato: number | null
  suggerimenti: SuggerimentiCedolino | null
}

export type RiepilogoAnno = {
  anno: number
  mesi: {
    mese: string
    etichetta: string
    totale: CalcoloMese
    rata: string
    valuta: string
    cedolino: { id: string; rata: string; lordo: number | null; netto: number | null; valuta: string | null } | null
  }[]
  somma: { ore: number; lordo: number; enpam: number; ritenuta: number; netto: number; reperibilita: number }
}

export type StatoCollegamenti = { desktop: boolean; menuAvvio: boolean; giaChiesto: boolean }

export type FaseAggiornamento = 'inattivo' | 'controllo' | 'disponibile' | 'download' | 'installazione' | 'errore'

export type StatoAggiornamento = {
  supportato: boolean
  versioneCorrente: string
  fase: FaseAggiornamento
  percentuale: number
  disponibile: { versione: string; note: string } | null
  messaggio: string
}

export type ApiCacca = {
  auth: {
    stato(): Promise<RispostaDb<StatoAuth>>
    setup(r: NuovoUtente): Promise<RispostaDb<Utente>>
    login(email: string, password: string): Promise<RispostaDb<Utente>>
    logout(): Promise<RispostaDb<null>>
    cambiaPassword(vecchia: string, nuova: string): Promise<RispostaDb<null>>
  }
  utenti: {
    list(): Promise<RispostaDb<Utente[]>>
    insert(r: NuovoUtente): Promise<RispostaDb<null>>
    update(id: string, campi: Partial<Utente>): Promise<RispostaDb<null>>
    resetPassword(id: string, nuova: string): Promise<RispostaDb<null>>
    remove(id: string): Promise<RispostaDb<null>>
  }
  preferenze: {
    tutte(): Promise<RispostaDb<Record<string, string>>>
    imposta(chiave: string, valore: string | null): Promise<RispostaDb<null>>
  }
  postazioni: {
    list(): Promise<RispostaDb<Postazione[]>>
    salva(r: Partial<Postazione>): Promise<RispostaDb<{ id: string }>>
    elimina(id: string): Promise<RispostaDb<null>>
  }
  turni: {
    mese(postazioneId: string, mese: string): Promise<RispostaDb<MeseTurni>>
    /** Sostituisce tutti i turni del giorno (elenco vuoto = giorno libero). */
    imposta(r: {
      data: string
      postazioneId: string
      tipi: { tipo: TipoTurnoCodice; superfestivoOre?: number | null; note?: string | null }[]
    }): Promise<RispostaDb<{ tipi: { tipo: TipoTurnoCodice; superfestivoOre: number }[] } | null>>
    repImposta(r: { data: string; postazioneId: string; quantita: number }): Promise<RispostaDb<null>>
    propostaSuperfestivo(data: string, tipo: TipoTurnoCodice): Promise<RispostaDb<number>>
  }
  calcoli: {
    mese(mese: string): Promise<RispostaDb<RaccoltaMese>>
    anno(anno: number): Promise<RispostaDb<RiepilogoAnno>>
    mesiDisponibili(): Promise<RispostaDb<string[]>>
  }
  excel: {
    genera(postazioneId: string, mese: string): Promise<
      RispostaDb<{ percorso: string; totaleOre: number; totaleRep: number } | null>
    >
  }
  cedolini: {
    list(): Promise<RispostaDb<Cedolino[]>>
    importa(): Promise<RispostaDb<Riconciliazione | null>>
    riconcilia(id: string): Promise<RispostaDb<Riconciliazione>>
    /** Risposta alla domanda «questa sede a quale postazione corrisponde?» */
    collegaSede(r: {
      sede: string
      postazioneId?: string
      creaNuova?: boolean
      nome?: string
      allineaNome?: boolean
    }): Promise<RispostaDb<{ id: string; nome: string; creata: boolean }>>
    apri(id: string): Promise<RispostaDb<null>>
    elimina(id: string): Promise<RispostaDb<null>>
  }
  benzina: {
    list(): Promise<RispostaDb<PrezzoBenzina[]>>
    imposta(mese: string, prezzo: number): Promise<RispostaDb<null>>
  }
  tariffe: {
    list(): Promise<RispostaDb<Tariffa[]>>
    salva(r: Partial<Tariffa>): Promise<RispostaDb<null>>
    elimina(id: string): Promise<RispostaDb<null>>
  }
  incarichi: {
    list(): Promise<RispostaDb<Incarico[]>>
    salva(r: Partial<Incarico>): Promise<RispostaDb<null>>
    elimina(id: string): Promise<RispostaDb<null>>
  }
  datiApp: {
    info(): Promise<RispostaDb<{ cartella: string; dimensione: number }>>
    esporta(): Promise<RispostaDb<{ percorso: string } | null>>
    apriCartella(): Promise<RispostaDb<null>>
  }
  sistemazione: {
    stato(): Promise<RispostaDb<{ serve: boolean; posizioneAttuale: string; destinazione: string }>>
    /** Apre la scelta della cartella di installazione; null se annullata. */
    scegliCartella(): Promise<RispostaDb<string | null>>
    esegui(scelte: {
      destinazione: string
      collegamentoDesktop: boolean
      collegamentoMenu: boolean
    }): Promise<RispostaDb<{ destinazione: string }>>
    rifiuta(): Promise<RispostaDb<null>>
  }
  collegamenti: {
    stato(): Promise<RispostaDb<StatoCollegamenti>>
    crea(scelte: { desktop: boolean; menuAvvio: boolean }): Promise<RispostaDb<{ fatti: string[] }>>
    rimanda(): Promise<RispostaDb<null>>
    mostraCartella(): Promise<RispostaDb<null>>
  }
  aggiornamenti: {
    stato(): Promise<RispostaDb<StatoAggiornamento>>
    controlla(): Promise<RispostaDb<unknown>>
    installa(): Promise<RispostaDb<null>>
    osserva(callback: (stato: StatoAggiornamento) => void): () => void
  }
  versione(): Promise<string>
}

declare global {
  interface Window {
    cacca?: ApiCacca
  }
}

// Dentro CACCA.exe il ponte `window.cacca` esiste e comanda lui (archivio
// SQLite accanto all'eseguibile). Nel browser (solo sviluppo) si usa una
// versione dimostrativa in memoria con la STESSA interfaccia.
export const dbLocale: ApiCacca = window.cacca ?? creaApiBrowser()
