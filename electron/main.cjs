// CACCA — Calcolo Automatico Cedolini Continuità Assistenziale
// Processo principale Electron. App COMPLETAMENTE locale: database SQLite
// nella cartella "dati" ACCANTO all'eseguibile (così un ripristino di Windows
// su C: non tocca i dati se l'app vive su un altro disco, es. D:\CACCA).
// Unica uscita su internet: il controllo aggiornamenti su GitHub.

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, screen } = require('electron')
const agg = require('./aggiornamenti.cjs')
const motore = require('./motore.cjs')
const excel = require('./excel.cjs')
const online = require('./online.cjs')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')

const SMOKE = process.argv.includes('--smoke')

if (SMOKE) {
  app.disableHardwareAcceleration()
  process.on('unhandledRejection', (e) => {
    console.error('[SMOKE] rejection:', e)
    app.exit(1)
  })
  process.on('uncaughtException', (e) => {
    console.error('[SMOKE] exception:', e)
    app.exit(1)
  })
}

/** @type {import('better-sqlite3').Database | null} */
let db = null
/** Utente attualmente connesso (sessione in memoria: si perde alla chiusura). */
let sessione = null

// La cartella dei dati sta SEMPRE accanto all'eseguibile: è la regola della
// casa (versione portable e anche la copia "a cartella" usata per le prove).
// CACCA_DATI_DIR la sovrascrive (preparazione dati e collaudi).
function cartellaDati() {
  if (process.env.CACCA_DATI_DIR) {
    return process.env.CACCA_DATI_DIR
  }
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'dati')
  }
  if (app.isPackaged) {
    return path.join(path.dirname(app.getPath('exe')), 'dati')
  }
  return path.join(process.cwd(), 'dati')
}

function apriDb(nomeFile = 'cacca.db') {
  const Database = require('better-sqlite3')
  const dir = cartellaDati()
  fs.mkdirSync(dir, { recursive: true })
  db = new Database(path.join(dir, nomeFile))
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.exec(`
    create table if not exists utenti (
      id            text primary key,
      nome          text,
      cognome       text,
      email         text not null,
      pwd_hash      text not null,
      pwd_salt      text not null,
      ruolo         text not null default 'utente',
      attivo        integer not null default 1,
      creato_il     text not null default (datetime('now')),
      aggiornato_il text not null default (datetime('now'))
    );
    create unique index if not exists utenti_email_uidx on utenti (lower(trim(email)));

    create table if not exists preferenze (
      utente_id text not null,
      chiave    text not null,
      valore    text,
      primary key (utente_id, chiave)
    );

    create table if not exists app_meta (k text primary key, v text);

    -- sede_cedolino: com'è scritta la sede nei cedolini di questa postazione
    -- (si impara una volta sola, confermando la domanda all'importazione)
    create table if not exists postazioni (
      id              text primary key,
      nome            text not null,
      nome_excel      text not null,
      suffisso_foglio text not null default '',
      ordine          integer not null default 0,
      attiva          integer not null default 1,
      sede_cedolino   text
    );

    -- Un giorno può avere PIÙ turni nella stessa postazione (es. 31/12:
    -- prefestivo di giorno + notte di Capodanno): l'unicità è per tipo.
    create table if not exists turni (
      id               text primary key,
      data             text not null,             -- 'YYYY-MM-DD'
      postazione_id    text not null,
      tipo             text not null,             -- codice tipo turno (motore.TIPI_TURNO)
      superfestivo_ore integer not null default 0,
      note             text,
      aggiornato_il    text not null default (datetime('now'))
    );
    create unique index if not exists turni_data_post_tipo_uidx on turni (data, postazione_id, tipo);

    create table if not exists reperibilita (
      id            text primary key,
      data          text not null,
      postazione_id text not null,
      quantita      integer not null default 1,
      note          text
    );
    create unique index if not exists rep_data_post_uidx on reperibilita (data, postazione_id);

    -- tariffe con decorrenza: 'dal' è il MESE DI LAVORO ('YYYY-MM') da cui vale
    create table if not exists tariffe (
      id     text primary key,
      tipo   text not null,
      valore real not null,
      dal    text not null,
      note   text
    );
    create unique index if not exists tariffe_tipo_dal_uidx on tariffe (tipo, dal);

    -- prezzo medio della benzina (€/litro) per mese di lavoro: ACN art. 72 c.2
    create table if not exists benzina (
      mese   text primary key,                    -- 'YYYY-MM'
      prezzo real not null,
      fonte  text
    );

    create table if not exists incarichi (
      id         text primary key,
      iscrizione text not null,
      dal        text,
      al         text,
      sede       text,
      note       text
    );

    create table if not exists cedolini (
      id            text primary key,
      rata          text not null,               -- 'YYYY-MM'
      file          text,
      iscrizione    text,
      sede          text,
      lordo         real,
      netto         real,
      valuta        text,
      voci_json     text,
      enpam_json    text,
      ritenuta_json text,
      importato_il  text not null default (datetime('now')),
      note          text,
      -- anomalie messe a tacere dall'utente ("le ho sistemate / va bene così")
      anomalie_risolte integer not null default 0
    );
    create unique index if not exists cedolini_rata_uidx on cedolini (rata);
  `)
  // archivi nati prima: le colonne si aggiungono senza toccare i dati
  const colonnePost = db.prepare('pragma table_info(postazioni)').all().map((c) => c.name)
  if (!colonnePost.includes('sede_cedolino')) db.exec('alter table postazioni add column sede_cedolino text')
  const colonneCed = db.prepare('pragma table_info(cedolini)').all().map((c) => c.name)
  if (!colonneCed.includes('anomalie_risolte')) {
    db.exec('alter table cedolini add column anomalie_risolte integer not null default 0')
  }
  impostaValoriBase()
  seminaSeServe()
}

// Valori contrattuali di base (pubblici, dal contratto): presenti anche in
// un'installazione nuova. NON si creano postazioni: quelle le inserisce
// l'utente (o nascono dal primo cedolino importato), così un'installazione
// nuova parte davvero vuota.
function impostaValoriBase() {
  const n = db.prepare('select count(*) as n from tariffe').get().n
  if (n === 0) {
    const ins = db.prepare('insert into tariffe (id, tipo, valore, dal, note) values (?, ?, ?, ?, ?)')
    const base = [
      ['onorario', 24.25, '2000-01', 'ACN 4/4/2024 (triennio 2019-21)'],
      ['onorario', 25.1, '2026-02', 'ACN 15/1/2026 (+0,85 €/h)'],
      ['air_ora', 5.0, '2000-01', 'Incremento onorario A.I.R. Lazio'],
      ['reperibilita', 35.09, '2000-01', 'Turno di reperibilità A.I.R. Lazio'],
      ['superfestivo_ora', 15.0, '2000-01', 'Maggiorazione festività di particolare importanza (AIR art. 23)'],
      ['enpam_pct', 15.625, '2000-01', 'ENPAM Cassa Pensione a carico del medico'],
      ['ra_pct', 20.0, '2000-01', "Ritenuta d'acconto su (lordo − ENPAM)"],
    ]
    for (const [tipo, valore, dal, note] of base) ins.run(crypto.randomUUID(), tipo, valore, dal, note)
  }
}

// Primo avvio in sviluppo: se è presente il file di precaricamento con i DATI
// PERSONALI (turni, cedolini, benzina) lo applica una volta sola.
// ATTENZIONE: il file NON viene incluso nell'eseguibile distribuito né nel
// repository (vedi package.json e .gitignore): chi scarica l'app parte vuoto.
// --forza-seed: riapplica il precaricamento anche se era già stato fatto
// (serve a travasare i dati in un'installazione già avviata; non tocca gli utenti)
const FORZA_SEED = process.argv.includes('--forza-seed')

function seminaSeServe() {
  const fatto = db.prepare("select v from app_meta where k = 'seed_dati'").get()
  if (fatto && !FORZA_SEED) return
  const fileSeed = path.join(__dirname, 'seed-dati.json')
  if (fs.existsSync(fileSeed)) {
    try {
      const seed = JSON.parse(fs.readFileSync(fileSeed, 'utf8'))
      applicaSeed(seed)
    } catch (e) {
      console.error('Seed non caricato:', e)
    }
  }
  db.prepare("insert or replace into app_meta (k, v) values ('seed_dati', 'fatto')").run()
}

function applicaSeed(seed) {
  const idPostazione = {}
  const tx = db.transaction(() => {
    for (const p of seed.postazioni || []) {
      const esiste = db.prepare('select id, sede_cedolino from postazioni where nome_excel = ?').get(p.nome_excel)
      const id = esiste ? esiste.id : crypto.randomUUID()
      if (!esiste) {
        db.prepare(
          'insert into postazioni (id, nome, nome_excel, suffisso_foglio, ordine, sede_cedolino) values (?, ?, ?, ?, ?, ?)',
        ).run(id, p.nome, p.nome_excel, p.suffisso_foglio || '', p.ordine || 0, p.sede_cedolino || null)
      } else if (!esiste.sede_cedolino && p.sede_cedolino) {
        // la postazione c'è già: le si insegna solo la sede scritta sul cedolino
        db.prepare('update postazioni set sede_cedolino = ? where id = ?').run(p.sede_cedolino, id)
      }
      idPostazione[p.chiave] = id
    }
    for (const t of seed.tariffe || []) {
      db.prepare(
        `insert into tariffe (id, tipo, valore, dal, note) values (?, ?, ?, ?, ?)
         on conflict(tipo, dal) do update set valore = excluded.valore, note = excluded.note`,
      ).run(crypto.randomUUID(), t.tipo, t.valore, t.dal, t.note || null)
    }
    for (const b of seed.benzina || []) {
      db.prepare('insert or replace into benzina (mese, prezzo, fonte) values (?, ?, ?)').run(
        b.mese,
        b.prezzo,
        b.fonte || null,
      )
    }
    for (const i of seed.incarichi || []) {
      const gia = db.prepare('select id from incarichi where iscrizione = ?').get(i.iscrizione)
      if (gia) continue // già registrato (magari ricavato da un cedolino)
      db.prepare('insert into incarichi (id, iscrizione, dal, al, sede, note) values (?, ?, ?, ?, ?, ?)').run(
        crypto.randomUUID(), i.iscrizione, i.dal || null, i.al || null, i.sede || null, i.note || null,
      )
    }
    for (const t of seed.turni || []) {
      db.prepare(
        `insert into turni (id, data, postazione_id, tipo, superfestivo_ore, note) values (?, ?, ?, ?, ?, ?)
         on conflict(data, postazione_id, tipo) do update set
           superfestivo_ore = excluded.superfestivo_ore, note = excluded.note`,
      ).run(crypto.randomUUID(), t.data, idPostazione[t.postazione], t.tipo, t.superfestivo_ore || 0, t.note || null)
    }
    for (const r of seed.reperibilita || []) {
      db.prepare(
        `insert into reperibilita (id, data, postazione_id, quantita, note) values (?, ?, ?, ?, ?)
         on conflict(data, postazione_id) do update set quantita = excluded.quantita, note = excluded.note`,
      ).run(crypto.randomUUID(), r.data, idPostazione[r.postazione], r.quantita || 1, r.note || null)
    }
    for (const c of seed.cedolini || []) {
      db.prepare(
        `insert into cedolini (id, rata, file, iscrizione, sede, lordo, netto, valuta, voci_json, enpam_json, ritenuta_json, note)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(rata) do update set
           file = excluded.file, iscrizione = excluded.iscrizione, sede = excluded.sede,
           lordo = excluded.lordo, netto = excluded.netto, valuta = excluded.valuta,
           voci_json = excluded.voci_json, enpam_json = excluded.enpam_json,
           ritenuta_json = excluded.ritenuta_json, note = excluded.note`,
      ).run(
        crypto.randomUUID(), c.rata, c.file || null, c.iscrizione || null, c.sede || null, c.lordo || null,
        c.netto || null, c.valuta || null, JSON.stringify(c.voci || []), JSON.stringify(c.enpam || []),
        JSON.stringify(c.ritenuta || null), c.note || null,
      )
    }
  })
  tx()

  // copia dei PDF originali nell'archivio dell'app (se ancora presenti sul disco)
  for (const c of seed.cedolini || []) {
    if (!c.file_origine) continue
    try {
      if (fs.existsSync(c.file_origine)) {
        const dest = path.join(cartellaCedolini(), `cedolino-${c.rata}.pdf`)
        fs.copyFileSync(c.file_origine, dest)
        db.prepare('update cedolini set file = ? where rata = ?').run(dest, c.rata)
      }
    } catch {
      /* il PDF originale non c'è più: pazienza, restano i dati */
    }
  }
}

function cartellaCedolini() {
  const dir = path.join(cartellaDati(), 'cedolini')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ---------- copia di sicurezza automatica (una al giorno, tiene le ultime 30) ----------
async function backupAutomatico() {
  try {
    const oggi = new Date().toISOString().slice(0, 10)
    const ultimo = db.prepare("select v from app_meta where k = 'ultimo_backup'").get()
    if (ultimo && ultimo.v === oggi) return
    const dir = path.join(cartellaDati(), 'backup')
    fs.mkdirSync(dir, { recursive: true })
    await db.backup(path.join(dir, `cacca-${oggi}.db`))
    db.prepare("insert or replace into app_meta (k, v) values ('ultimo_backup', ?)").run(oggi)
    const file = fs
      .readdirSync(dir)
      .filter((f) => /^cacca-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .sort()
    for (const vecchio of file.slice(0, Math.max(0, file.length - 30))) {
      fs.unlinkSync(path.join(dir, vecchio))
    }
    registra(`backup giornaliero creato (${oggi}), in archivio: ${Math.min(file.length, 30)}`)
  } catch (e) {
    registra(`backup giornaliero non riuscito: ${String((e && e.message) || e)}`)
  }
}

// ---------- helper ----------
function pulisci(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function eDuplicato(e) {
  return e && (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE/i.test(String(e.message || '')))
}

function rispondi(fn) {
  try {
    const data = fn()
    programmaInvioOnline() // se l'archivio online è attivo, si riallinea da solo
    return { data, error: null }
  } catch (e) {
    if (eDuplicato(e)) {
      return { data: null, error: { code: '23505', message: 'Valore già presente.' } }
    }
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
}

// L'invio online non deve rallentare l'uso: si accumulano le modifiche e si
// manda tutto qualche secondo dopo l'ultima.
let invioProgrammato = null

function programmaInvioOnline() {
  if (!chiaviOnline) return
  if (invioProgrammato) clearTimeout(invioProgrammato)
  invioProgrammato = setTimeout(() => {
    invioProgrammato = null
    inviaOnline().catch((e) => registra(`invio online non riuscito: ${String((e && e.message) || e)}`))
  }, 4000)
}

function richiediSessione() {
  if (!sessione) throw new Error('Sessione non attiva: effettua il login.')
  return sessione
}

function richiediAdmin() {
  const s = richiediSessione()
  if (s.ruolo !== 'admin') throw new Error('Operazione riservata agli amministratori.')
  return s
}

// Amministratore permanente: non può essere eliminato, declassato o disattivato.
const ADMIN_PERMANENTE = 'marabelli.s@gmail.com'

function ePermanente(email) {
  return String(email || '').trim().toLowerCase() === ADMIN_PERMANENTE
}

// ---------- password ----------
function calcolaHash(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex')
}

function passwordCorretta(utente, password) {
  const atteso = Buffer.from(utente.pwd_hash, 'hex')
  const dato = Buffer.from(calcolaHash(password, utente.pwd_salt), 'hex')
  return atteso.length === dato.length && crypto.timingSafeEqual(atteso, dato)
}

function validaPassword(password) {
  const p = String(password || '')
  if (p.length < 8) throw new Error('La password deve avere almeno 8 caratteri.')
  return p
}

function profiloPubblico(u) {
  return {
    id: u.id,
    nome: u.nome,
    cognome: u.cognome,
    email: u.email,
    ruolo: u.ruolo,
    attivo: !!u.attivo,
  }
}

function inserisciUtente({ nome, cognome, email, password, ruolo }) {
  const mail = pulisci(email)
  if (!mail) throw new Error("L'indirizzo email (nome utente) è obbligatorio.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error('Indirizzo email non valido.')
  const pwd = validaPassword(password)
  const salt = crypto.randomBytes(16).toString('hex')
  const id = crypto.randomUUID()
  const liv = ePermanente(mail) || ruolo === 'admin' ? 'admin' : 'utente'
  db.prepare(
    `insert into utenti (id, nome, cognome, email, pwd_hash, pwd_salt, ruolo)
     values (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, pulisci(nome), pulisci(cognome), mail.toLowerCase(), calcolaHash(pwd, salt), salt, liv)
  return id
}

function elencoUtenti(s) {
  if (!s || s.ruolo !== 'admin') throw new Error('Operazione riservata agli amministratori.')
  return db
    .prepare('select id, nome, cognome, email, ruolo, attivo, creato_il from utenti order by lower(cognome), lower(nome)')
    .all()
    .map((u) => ({ ...u, attivo: !!u.attivo, permanente: ePermanente(u.email) }))
}

function aggiornaUtente(s, id, campi) {
  if (!s) throw new Error('Sessione non attiva.')
  if (s.id !== id && s.ruolo !== 'admin') throw new Error('Operazione riservata agli amministratori.')
  const attuale = db.prepare('select * from utenti where id = ?').get(id)
  if (!attuale) throw new Error('Utente non trovato.')

  const mail = pulisci(campi.email)
  if (!mail) throw new Error("L'indirizzo email (nome utente) è obbligatorio.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error('Indirizzo email non valido.')

  let ruolo = s.ruolo === 'admin' && campi.ruolo ? (campi.ruolo === 'admin' ? 'admin' : 'utente') : undefined
  let email = mail.toLowerCase()

  if (ePermanente(attuale.email)) {
    if (email !== String(attuale.email).toLowerCase()) {
      throw new Error("L'amministratore permanente non può cambiare indirizzo email.")
    }
    ruolo = 'admin'
  }

  if (ruolo === 'utente') {
    const admin = db.prepare("select count(*) as n from utenti where ruolo = 'admin' and id <> ?").get(id).n
    if (admin === 0) throw new Error('Deve restare almeno un amministratore.')
  }

  db.prepare(
    `update utenti
        set nome = ?, cognome = ?, email = ?, ruolo = coalesce(?, ruolo), aggiornato_il = datetime('now')
      where id = ?`,
  ).run(pulisci(campi.nome), pulisci(campi.cognome), email, ruolo ?? null, id)
  return null
}

function eliminaUtente(s, id) {
  if (!s || s.ruolo !== 'admin') throw new Error('Operazione riservata agli amministratori.')
  if (s.id === id) throw new Error('Non puoi eliminare te stesso.')
  const u = db.prepare('select email, ruolo from utenti where id = ?').get(id)
  if (!u) throw new Error('Utente non trovato.')
  if (ePermanente(u.email)) {
    throw new Error("Questo è l'amministratore permanente: non può essere eliminato.")
  }
  if (u.ruolo === 'admin') {
    const admin = db.prepare("select count(*) as n from utenti where ruolo = 'admin' and id <> ?").get(id).n
    if (admin === 0) throw new Error('Deve restare almeno un amministratore.')
  }
  db.prepare('delete from preferenze where utente_id = ?').run(id)
  db.prepare('delete from utenti where id = ?').run(id)
  return null
}

function contaUtenti() {
  return db.prepare('select count(*) as n from utenti').get().n
}

// ---------- IPC: autenticazione ----------
ipcMain.handle('auth:stato', () =>
  rispondi(() => ({
    serveSetup: contaUtenti() === 0,
    utente: sessione ? { ...sessione } : null,
  })),
)

ipcMain.handle('auth:setup', (_ev, r) =>
  rispondi(() => {
    if (contaUtenti() > 0) throw new Error('Esiste già almeno un utente: usa il login.')
    const id = inserisciUtente({ ...r, ruolo: 'admin' })
    const u = db.prepare('select * from utenti where id = ?').get(id)
    sessione = profiloPubblico(u)
    return { ...sessione }
  }),
)

ipcMain.handle('auth:login', (_ev, { email, password }) =>
  rispondi(() => {
    const mail = String(email || '').trim().toLowerCase()
    const u = db.prepare('select * from utenti where lower(trim(email)) = ?').get(mail)
    if (!u || !passwordCorretta(u, password || '')) {
      throw new Error('Nome utente o password non corretti.')
    }
    if (!u.attivo) throw new Error('Utente disattivato: contatta un amministratore.')
    sessione = profiloPubblico(u)
    return { ...sessione }
  }),
)

ipcMain.handle('auth:logout', () =>
  rispondi(() => {
    sessione = null
    return null
  }),
)

ipcMain.handle('auth:cambia-password', (_ev, { vecchia, nuova }) =>
  rispondi(() => {
    const s = richiediSessione()
    const u = db.prepare('select * from utenti where id = ?').get(s.id)
    if (!u || !passwordCorretta(u, vecchia || '')) throw new Error('La password attuale non è corretta.')
    const pwd = validaPassword(nuova)
    const salt = crypto.randomBytes(16).toString('hex')
    db.prepare("update utenti set pwd_hash = ?, pwd_salt = ?, aggiornato_il = datetime('now') where id = ?").run(
      calcolaHash(pwd, salt),
      salt,
      s.id,
    )
    return null
  }),
)

// ---------- IPC: utenti ----------
ipcMain.handle('utenti:list', () => rispondi(() => elencoUtenti(richiediSessione())))

ipcMain.handle('utenti:insert', (_ev, r) =>
  rispondi(() => {
    richiediAdmin()
    inserisciUtente(r)
    return null
  }),
)

ipcMain.handle('utenti:update', (_ev, { id, campi }) =>
  rispondi(() => {
    aggiornaUtente(richiediSessione(), id, campi)
    if (sessione && sessione.id === id) {
      const u = db.prepare('select * from utenti where id = ?').get(id)
      sessione = profiloPubblico(u)
    }
    return null
  }),
)

ipcMain.handle('utenti:reset-password', (_ev, { id, nuova }) =>
  rispondi(() => {
    const s = richiediAdmin()
    const bersaglio = db.prepare('select email from utenti where id = ?').get(id)
    if (bersaglio && ePermanente(bersaglio.email) && s.id !== id) {
      throw new Error("Solo l'amministratore permanente può cambiare la propria password.")
    }
    const pwd = validaPassword(nuova)
    const salt = crypto.randomBytes(16).toString('hex')
    const info = db
      .prepare("update utenti set pwd_hash = ?, pwd_salt = ?, aggiornato_il = datetime('now') where id = ?")
      .run(calcolaHash(pwd, salt), salt, id)
    if (info.changes === 0) throw new Error('Utente non trovato.')
    return null
  }),
)

ipcMain.handle('utenti:delete', (_ev, id) => rispondi(() => eliminaUtente(richiediSessione(), id)))

// ---------- IPC: preferenze ----------
ipcMain.handle('pref:tutte', () =>
  rispondi(() => {
    const s = richiediSessione()
    const righe = db.prepare('select chiave, valore from preferenze where utente_id = ?').all(s.id)
    const out = {}
    for (const r of righe) out[r.chiave] = r.valore
    return out
  }),
)

ipcMain.handle('pref:imposta', (_ev, { chiave, valore }) =>
  rispondi(() => {
    const s = richiediSessione()
    db.prepare('insert or replace into preferenze (utente_id, chiave, valore) values (?, ?, ?)').run(
      s.id,
      String(chiave),
      valore === null || valore === undefined ? null : String(valore),
    )
    return null
  }),
)

// ---------- IPC: postazioni ----------
function elencoPostazioni() {
  return db
    .prepare(
      `select p.id, p.nome, p.nome_excel, p.suffisso_foglio, p.ordine, p.attiva, p.sede_cedolino,
              (select count(*) from turni t where t.postazione_id = p.id) as turni,
              (select count(*) from reperibilita r where r.postazione_id = p.id) as reperibilita
         from postazioni p
        order by p.ordine, p.nome`,
    )
    .all()
    .map((p) => ({ ...p, attiva: !!p.attiva }))
}

ipcMain.handle('postazioni:list', () =>
  rispondi(() => {
    richiediSessione()
    return elencoPostazioni()
  }),
)

ipcMain.handle('postazioni:salva', (_ev, r) =>
  rispondi(() => {
    richiediSessione()
    const nome = pulisci(r.nome)
    const nomeExcel = pulisci(r.nome_excel)
    if (!nome || !nomeExcel) throw new Error("Il nome e l'intestazione del foglio excel sono obbligatori.")
    if (r.id) {
      db.prepare(
        `update postazioni set nome = ?, nome_excel = ?, suffisso_foglio = ?, ordine = ?, attiva = ?,
                               sede_cedolino = ?
          where id = ?`,
      ).run(
        nome, nomeExcel, r.suffisso_foglio || '', Number(r.ordine) || 0,
        r.attiva === false ? 0 : 1, pulisci(r.sede_cedolino), r.id,
      )
      return { id: r.id }
    }
    const id = crypto.randomUUID()
    const ultimo = db.prepare('select coalesce(max(ordine), 0) as n from postazioni').get().n
    db.prepare(
      'insert into postazioni (id, nome, nome_excel, suffisso_foglio, ordine, sede_cedolino) values (?, ?, ?, ?, ?, ?)',
    ).run(id, nome, nomeExcel, r.suffisso_foglio || '', Number(r.ordine) || ultimo + 1, pulisci(r.sede_cedolino))
    return { id }
  }),
)

// Una postazione con turni o reperibilità NON si cancella: si può solo
// disattivare (così lo storico e i cedolini restano coerenti).
ipcMain.handle('postazioni:elimina', (_ev, id) =>
  rispondi(() => {
    richiediSessione()
    const p = db.prepare('select nome from postazioni where id = ?').get(id)
    if (!p) throw new Error('Postazione non trovata.')
    const turni = db.prepare('select count(*) as n from turni where postazione_id = ?').get(id).n
    const rep = db.prepare('select count(*) as n from reperibilita where postazione_id = ?').get(id).n
    if (turni + rep > 0) {
      const pezzi = []
      if (turni) pezzi.push(`${turni} ${turni === 1 ? 'turno' : 'turni'}`)
      if (rep) pezzi.push(`${rep} ${rep === 1 ? 'reperibilità' : 'reperibilità'}`)
      throw new Error(
        `«${p.nome}» non si può eliminare: contiene ${pezzi.join(' e ')}. ` +
          'Se non la usi più, toglile la spunta «attiva»: sparisce dai calendari ma lo storico resta.',
      )
    }
    db.prepare('delete from postazioni where id = ?').run(id)
    return null
  }),
)

// ---------- IPC: turni e reperibilità ----------
function turniDelMese(postazioneId, mese) {
  const like = `${mese}-%`
  const turni = db
    .prepare('select data, tipo, superfestivo_ore, note from turni where postazione_id = ? and data like ? order by data')
    .all(postazioneId, like)
  const reperibilita = db
    .prepare('select data, quantita, note from reperibilita where postazione_id = ? and data like ? order by data')
    .all(postazioneId, like)
  return { turni, reperibilita }
}

ipcMain.handle('turni:mese', (_ev, { postazioneId, mese }) =>
  rispondi(() => {
    richiediSessione()
    return turniDelMese(postazioneId, String(mese))
  }),
)

// Sostituisce TUTTI i turni del giorno nella postazione con l'elenco indicato
// (elenco vuoto = giorno libero). Un giorno può avere più turni (colonne).
ipcMain.handle('turni:imposta', (_ev, r) =>
  rispondi(() => {
    richiediSessione()
    const data = String(r.data)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data non valida.')
    if (!r.postazioneId) throw new Error('Postazione non indicata.')
    const tipi = Array.isArray(r.tipi) ? r.tipi : []
    for (const t of tipi) {
      if (!motore.tipoTurno(t.tipo)) throw new Error('Tipo di turno sconosciuto.')
    }
    const salvati = []
    const tx = db.transaction(() => {
      db.prepare('delete from turni where data = ? and postazione_id = ?').run(data, r.postazioneId)
      for (const t of tipi) {
        const sf =
          t.superfestivoOre === null || t.superfestivoOre === undefined
            ? motore.oreSuperfestiveAuto(data, t.tipo)
            : Math.max(0, Number(t.superfestivoOre) || 0)
        db.prepare(
          'insert into turni (id, data, postazione_id, tipo, superfestivo_ore, note) values (?, ?, ?, ?, ?, ?)',
        ).run(crypto.randomUUID(), data, r.postazioneId, t.tipo, sf, pulisci(t.note))
        salvati.push({ tipo: t.tipo, superfestivoOre: sf })
      }
    })
    tx()
    return { tipi: salvati }
  }),
)

ipcMain.handle('turni:rep-imposta', (_ev, r) =>
  rispondi(() => {
    richiediSessione()
    const data = String(r.data)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data non valida.')
    if (!r.postazioneId) throw new Error('Postazione non indicata.')
    const q = Math.max(0, Math.min(2, Number(r.quantita) || 0))
    if (q === 0) {
      db.prepare('delete from reperibilita where data = ? and postazione_id = ?').run(data, r.postazioneId)
      return null
    }
    db.prepare(
      `insert into reperibilita (id, data, postazione_id, quantita, note) values (?, ?, ?, ?, ?)
       on conflict(data, postazione_id) do update set quantita = excluded.quantita, note = excluded.note`,
    ).run(crypto.randomUUID(), data, r.postazioneId, q, pulisci(r.note))
    return null
  }),
)

ipcMain.handle('turni:superfestivo-auto', (_ev, { data, tipo }) =>
  rispondi(() => {
    richiediSessione()
    return motore.oreSuperfestiveAuto(String(data), String(tipo))
  }),
)

// ---------- calcoli ----------
function tutteLeTariffe() {
  return db.prepare('select id, tipo, valore, dal, note from tariffe order by tipo, dal').all()
}

function prezzoBenzina(mese) {
  const esatto = db.prepare('select prezzo, fonte from benzina where mese = ?').get(mese)
  if (esatto) return { prezzo: esatto.prezzo, stimato: /stima/i.test(String(esatto.fonte || '')), fonte: esatto.fonte }
  const ultimo = db.prepare('select mese, prezzo from benzina where mese < ? order by mese desc limit 1').get(mese)
  if (ultimo) return { prezzo: ultimo.prezzo, stimato: true, da: ultimo.mese }
  const dopo = db.prepare('select mese, prezzo from benzina where mese > ? order by mese asc limit 1').get(mese)
  if (dopo) return { prezzo: dopo.prezzo, stimato: true, da: dopo.mese }
  return { prezzo: null, stimato: true }
}

/**
 * Ogni mese in cui c'è almeno un turno o un cedolino deve avere il suo prezzo
 * della benzina (è la voce «compenso chilometrico»: ACN art. 72 c. 2, un litro
 * di benzina verde per ogni ora di servizio).
 *  - se il mese è già stato pagato, il prezzo VERO si ricava dal cedolino
 *    (importo della voce 11 diviso le ore): è quello usato dalla ASL;
 *  - per i mesi non ancora pagati si mette il prezzo noto più vicino, marcato
 *    come stima, così la previsione non resta a zero.
 * Ritorna l'elenco dei mesi sistemati.
 */
function assicuraPrezziBenzina() {
  const mesi = new Set()
  for (const r of db.prepare("select distinct substr(data, 1, 7) as m from turni").all()) mesi.add(r.m)
  for (const r of db.prepare('select rata from cedolini').all()) mesi.add(motore.mesePiu(r.rata, -1))

  const sistemati = []
  for (const mese of Array.from(mesi).sort()) {
    // 1) prezzo esatto dal cedolino che ha pagato quel mese
    const ced = db.prepare('select voci_json from cedolini where rata = ?').get(motore.mesePiu(mese, 1))
    if (ced) {
      let voci = []
      try {
        voci = JSON.parse(ced.voci_json) || []
      } catch {
        /* cedolino senza dettaglio */
      }
      const km = voci
        .filter((v) => v.codice === '11' && !v.rif)
        .reduce((acc, v) => acc + (v.importo || 0), 0)
      const ore = oreDelMese(mese)
      if (km > 0 && ore > 0) {
        const prezzo = Math.round((km / ore) * 100000) / 100000
        const attuale = db.prepare('select prezzo, fonte from benzina where mese = ?').get(mese)
        if (!attuale || attuale.prezzo !== prezzo || /stima/i.test(String(attuale.fonte || ''))) {
          db.prepare('insert or replace into benzina (mese, prezzo, fonte) values (?, ?, ?)').run(
            mese, prezzo, `ricavato dal cedolino di ${motore.etichettaMese(motore.mesePiu(mese, 1))}`,
          )
          sistemati.push({ mese, prezzo, esatto: true })
        }
        continue
      }
    }
    // 2) mese non ancora pagato: si usa il prezzo noto più vicino
    if (db.prepare('select mese from benzina where mese = ?').get(mese)) continue
    const vicino =
      db.prepare("select mese, prezzo from benzina where mese < ? and fonte not like '%stima%' order by mese desc limit 1").get(mese) ||
      db.prepare("select mese, prezzo from benzina where mese > ? and fonte not like '%stima%' order by mese asc limit 1").get(mese)
    if (!vicino) continue
    db.prepare('insert or replace into benzina (mese, prezzo, fonte) values (?, ?, ?)').run(
      mese, vicino.prezzo, `stima (ultimo prezzo noto: ${motore.etichettaMese(vicino.mese)})`,
    )
    sistemati.push({ mese, prezzo: vicino.prezzo, esatto: false })
  }
  return sistemati
}

/** Ore totali dichiarate in un mese (tutte le postazioni). */
function oreDelMese(mese) {
  let ore = 0
  for (const t of db.prepare("select tipo from turni where data like ?").all(`${mese}-%`)) {
    const tipo = motore.tipoTurno(t.tipo)
    if (tipo) ore += tipo.ore
  }
  return ore
}

/** Calcolo completo di un mese di lavoro: per postazione e totale. */
function raccogliMese(mese) {
  const tariffe = tutteLeTariffe()
  const benzina = prezzoBenzina(mese)
  const postazioni = elencoPostazioni().filter((p) => p.attiva)
  const dettagli = []
  let turniTotali = []
  let repTotali = []
  for (const p of postazioni) {
    const { turni, reperibilita } = turniDelMese(p.id, mese)
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

ipcMain.handle('calcoli:mese', (_ev, mese) =>
  rispondi(() => {
    richiediSessione()
    if (!/^\d{4}-\d{2}$/.test(String(mese))) throw new Error('Mese non valido.')
    return raccogliMese(String(mese))
  }),
)

ipcMain.handle('calcoli:anno', (_ev, anno) =>
  rispondi(() => {
    richiediSessione()
    const a = Number(anno)
    if (!Number.isFinite(a)) throw new Error('Anno non valido.')
    const mesi = []
    const somma = { ore: 0, lordo: 0, enpam: 0, ritenuta: 0, netto: 0, reperibilita: 0 }
    for (let m = 1; m <= 12; m++) {
      const mese = `${a}-${String(m).padStart(2, '0')}`
      const nTurni = db.prepare('select count(*) as n from turni where data like ?').get(`${mese}-%`).n
      const nRep = db.prepare('select count(*) as n from reperibilita where data like ?').get(`${mese}-%`).n
      if (nTurni === 0 && nRep === 0) continue
      const r = raccogliMese(mese)
      const ced = db.prepare('select id, rata, lordo, netto, valuta from cedolini where rata = ?').get(r.rata)
      mesi.push({ mese, etichetta: r.etichetta, totale: r.totale, rata: r.rata, valuta: r.valuta, cedolino: ced || null })
      somma.ore += r.totale.ore
      somma.reperibilita += r.totale.reperibilita
      somma.lordo += r.totale.lordo
      somma.enpam += r.totale.enpam
      somma.ritenuta += r.totale.ritenuta
      somma.netto += r.totale.netto
    }
    for (const k of Object.keys(somma)) somma[k] = motore.round2(somma[k])
    return { anno: a, mesi, somma }
  }),
)

ipcMain.handle('calcoli:mesi-disponibili', () =>
  rispondi(() => {
    richiediSessione()
    const daTurni = db.prepare("select distinct substr(data, 1, 7) as m from turni").all().map((r) => r.m)
    const daRep = db.prepare("select distinct substr(data, 1, 7) as m from reperibilita").all().map((r) => r.m)
    const insieme = new Set([...daTurni, ...daRep])
    return Array.from(insieme).sort()
  }),
)

// ---------- IPC: riepilogo turni (excel e PDF) ----------
/** Stampa un HTML in PDF con una finestra nascosta (impaginazione A4). */
async function stampaPdf(html, destinazione) {
  const finestra = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false },
  })
  try {
    await finestra.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await finestra.webContents.printToPDF({
      pageSize: 'A4',
      landscape: true, // foglio orizzontale: ci sta tutto in una pagina
      printBackground: true,
      margins: { marginType: 'none' }, // i margini li decide il CSS (@page)
    })
    fs.writeFileSync(destinazione, pdf)
  } finally {
    if (!finestra.isDestroyed()) finestra.destroy()
  }
}

ipcMain.handle('excel:genera', async (_ev, { postazioneId, mese, formato }) => {
  try {
    const s = richiediSessione()
    const p = db.prepare('select * from postazioni where id = ?').get(postazioneId)
    if (!p) throw new Error('Postazione non trovata.')
    if (!/^\d{4}-\d{2}$/.test(String(mese))) throw new Error('Mese non valido.')
    const pdf = formato === 'pdf'
    const { turni, reperibilita } = turniDelMese(postazioneId, mese)
    const medico = { cognome: s.cognome || '', nome: s.nome || '' }
    const dati = { mese, postazione: p, medico, turni, reperibilita }
    const { wb, totaleOre, totaleRep } = excel.componiRiepilogo(dati)

    const scelta = await dialog.showSaveDialog({
      title: pdf ? 'Salva riepilogo turni in PDF' : 'Salva riepilogo turni in Excel',
      defaultPath: excel.nomeFileRiepilogo(p, mese, pdf ? 'pdf' : 'xlsx'),
      filters: pdf ? [{ name: 'PDF', extensions: ['pdf'] }] : [{ name: 'Excel', extensions: ['xlsx'] }],
    })
    if (scelta.canceled || !scelta.filePath) return { data: null, error: null }

    if (pdf) await stampaPdf(excel.componiHtml(dati), scelta.filePath)
    else await wb.xlsx.writeFile(scelta.filePath)

    registra(`riepilogo ${pdf ? 'PDF' : 'excel'} creato: ${scelta.filePath}`)
    return { data: { percorso: scelta.filePath, totaleOre, totaleRep }, error: null }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

// ---------- IPC: cedolini ----------
function cedolinoDaRiga(r) {
  if (!r) return null
  const leggi = (t, fallback) => {
    try {
      return JSON.parse(t)
    } catch {
      return fallback
    }
  }
  return {
    id: r.id,
    rata: r.rata,
    file: r.file,
    iscrizione: r.iscrizione,
    sede: r.sede,
    lordo: r.lordo,
    netto: r.netto,
    valuta: r.valuta,
    anomalie_risolte: Boolean(r.anomalie_risolte),
    voci: leggi(r.voci_json, []),
    enpam: leggi(r.enpam_json, []),
    ritenuta: leggi(r.ritenuta_json, null),
    importato_il: r.importato_il,
    note: r.note,
  }
}

ipcMain.handle('cedolini:list', () =>
  rispondi(() => {
    richiediSessione()
    return db.prepare('select * from cedolini order by rata desc').all().map(cedolinoDaRiga)
  }),
)

function rifDiMese(mese) {
  const [a, m] = String(mese).split('-')
  return `${m}/${a.slice(2)}`
}

function riconciliaRata(rata) {
  const riga = db.prepare('select * from cedolini where rata = ?').get(rata)
  if (!riga) throw new Error('Cedolino non trovato.')
  const ced = cedolinoDaRiga(riga)
  const meseLavoro = motore.mesePiu(rata, -1)
  const atteso = raccogliMese(meseLavoro)
  const esito = motore.riconcilia(atteso.totale, ced)

  // Una voce "mancante" può essere stata pagata in ritardo in una rata
  // successiva (compare lì con "Rif MM/AA"): in quel caso non è un'anomalia,
  // lo si scrive e basta. È successo davvero con le reperibilità di dicembre.
  const codici = {
    'Onorario (voce 40)': '40',
    'Incremento A.I.R. (voce 45)': '45',
    'Reperibilità (voce 27)': '27',
    'Superfestivo (voce 46)': '46',
  }
  const rifAttesi = [rifDiMese(meseLavoro), rifDiMese(rata)]
  for (const r of esito.righe) {
    if (r.ok || (r.delta ?? 0) >= 0) continue
    const codice = codici[r.voce]
    if (!codice) continue
    for (const s of db.prepare('select rata, voci_json from cedolini where rata > ? order by rata').all(rata)) {
      let voci = []
      try {
        voci = JSON.parse(s.voci_json) || []
      } catch {
        /* ignora */
      }
      const recupero = voci
        .filter((v) => v.codice === codice && v.rif && rifAttesi.includes(v.rif))
        .reduce((acc, v) => acc + (v.importo || 0), 0)
      if (recupero > 0 && Math.abs(recupero + r.delta) < 0.005) {
        r.ok = true
        r.testo = `${r.testo ? r.testo + ' — ' : ''}pagata in ritardo nella rata ${s.rata} (arretrato ${motore.euro(recupero)} €)`
        break
      }
    }
  }
  esito.anomalie = esito.righe.filter((x) => !x.ok).length
  return {
    cedolino: ced,
    meseLavoro,
    etichettaMese: motore.etichettaMese(meseLavoro),
    atteso,
    ...esito,
    // se l'utente ha detto "va bene così", le differenze restano visibili
    // ma non fanno più scattare avvisi in giro per il programma
    anomalieRisolte: Boolean(riga.anomalie_risolte),
    anomalieAperte: riga.anomalie_risolte ? 0 : esito.anomalie,
  }
}

ipcMain.handle('cedolini:importa', async () => {
  try {
    richiediSessione()
    const scelta = await dialog.showOpenDialog({
      title: 'Importa cedolino (PDF NoiPA)',
      properties: ['openFile'],
      filters: [{ name: 'Cedolino PDF', extensions: ['pdf'] }],
    })
    if (scelta.canceled || !scelta.filePaths[0]) return { data: null, error: null }
    const origine = scelta.filePaths[0]

    const pdfParse = require('pdf-parse')
    const testo = (await pdfParse(fs.readFileSync(origine))).text
    const letto = motore.leggiCedolino(testo)
    if (!letto.rata) {
      throw new Error('Questo PDF non sembra un cedolino NoiPA: non trovo la rata (mese/anno).')
    }

    const dest = path.join(cartellaCedolini(), `cedolino-${letto.rata}.pdf`)
    fs.copyFileSync(origine, dest)

    db.prepare(
      `insert into cedolini (id, rata, file, iscrizione, sede, lordo, netto, valuta, voci_json, enpam_json, ritenuta_json)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(rata) do update set
         file = excluded.file, iscrizione = excluded.iscrizione, sede = excluded.sede,
         lordo = excluded.lordo, netto = excluded.netto, valuta = excluded.valuta,
         voci_json = excluded.voci_json, enpam_json = excluded.enpam_json,
         ritenuta_json = excluded.ritenuta_json, importato_il = datetime('now')`,
    ).run(
      crypto.randomUUID(), letto.rata, dest, letto.iscrizione, letto.sede, letto.totaleCompetenze,
      letto.netto, letto.valuta, JSON.stringify(letto.voci), JSON.stringify(letto.enpam),
      JSON.stringify(letto.ritenuta),
    )

    // il prezzo della benzina "vero" si ricava dal cedolino: voce 11 / ore del mese
    assicuraPrezziBenzina()
    registra(`cedolino ${letto.rata} importato da ${origine}`)
    return { data: { ...riconciliaRata(letto.rata), suggerimenti: suggerimentiDaCedolino(letto) }, error: null }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

/**
 * Dal cedolino si ricavano la sede di servizio e il numero di iscrizione:
 * se non li conosciamo ancora, si prepara la domanda da fare all'utente.
 * Nulla viene deciso in automatico.
 */
function suggerimentiDaCedolino(letto) {
  const postazioni = elencoPostazioni()
  const esito = { sede: null, iscrizione: null }

  if (letto.sede) {
    const trovata = motore.cercaPostazionePerSede(letto.sede, postazioni)
    if (!trovata.esatta) {
      esito.sede = {
        sede: letto.sede,
        candidato: trovata.postazione
          ? { id: trovata.postazione.id, nome: trovata.postazione.nome, somiglianza: trovata.somiglianza }
          : null,
        postazioni: postazioni.map((p) => ({ id: p.id, nome: p.nome })),
        // nome proposto per una postazione nuova: "PALOMBARA (PPI)" → "Palombara (PPI)"
        nomeProposto: nomeLeggibile(letto.sede),
      }
    }
  }

  if (letto.iscrizione) {
    const esiste = db.prepare('select id from incarichi where iscrizione = ?').get(letto.iscrizione)
    if (!esiste) {
      esito.iscrizione = { numero: letto.iscrizione, dal: motore.mesePiu(letto.rata, -1), sede: letto.sede || null }
    }
  }

  return esito.sede || esito.iscrizione ? esito : null
}

/** "PALOMBARA (PPI)" → "Palombara (PPI)" (iniziali maiuscole, sigle intatte). */
function nomeLeggibile(sede) {
  return String(sede || '')
    .toLowerCase()
    .replace(/\b[a-zàèéìòù]/g, (c) => c.toUpperCase())
    .replace(/\(([^)]*)\)/g, (_t, dentro) => `(${dentro.toUpperCase()})`)
    .trim()
}

/**
 * Risposta alla domanda "è questa la postazione?".
 * - postazioneId: collega la sede a una postazione esistente (e, se richiesto,
 *   ne allinea il nome a quello del cedolino);
 * - creaNuova: crea la postazione con il nome indicato.
 */
ipcMain.handle('cedolini:collega-sede', (_ev, r) =>
  rispondi(() => {
    richiediSessione()
    const sede = pulisci(r.sede)
    if (!sede) throw new Error('Sede non indicata.')

    if (r.creaNuova) {
      const nome = pulisci(r.nome) || nomeLeggibile(sede)
      const id = crypto.randomUUID()
      const ultimo = db.prepare('select coalesce(max(ordine), 0) as n from postazioni').get().n
      db.prepare(
        'insert into postazioni (id, nome, nome_excel, suffisso_foglio, ordine, sede_cedolino) values (?, ?, ?, ?, ?, ?)',
      ).run(id, nome, sede.toUpperCase(), '', ultimo + 1, sede)
      registra(`postazione «${nome}» creata dal cedolino (sede ${sede})`)
      return { id, nome, creata: true }
    }

    const p = db.prepare('select * from postazioni where id = ?').get(r.postazioneId)
    if (!p) throw new Error('Postazione non trovata.')
    if (r.allineaNome) {
      const nome = nomeLeggibile(sede)
      db.prepare('update postazioni set nome = ?, nome_excel = ?, sede_cedolino = ? where id = ?').run(
        nome, sede.toUpperCase(), sede, p.id,
      )
      registra(`postazione «${p.nome}» collegata alla sede ${sede} e rinominata «${nome}»`)
      return { id: p.id, nome, creata: false }
    }
    db.prepare('update postazioni set sede_cedolino = ? where id = ?').run(sede, p.id)
    registra(`postazione «${p.nome}» collegata alla sede ${sede}`)
    return { id: p.id, nome: p.nome, creata: false }
  }),
)

ipcMain.handle('cedolini:riconcilia', (_ev, id) =>
  rispondi(() => {
    richiediSessione()
    const r = db.prepare('select * from cedolini where id = ?').get(id)
    if (!r) throw new Error('Cedolino non trovato.')
    const esito = riconciliaRata(r.rata)
    // la domanda su sede e incarico resta finché non le si dà una risposta
    return { ...esito, suggerimenti: suggerimentiDaCedolino({ rata: r.rata, sede: r.sede, iscrizione: r.iscrizione }) }
  }),
)

// «Risolvi anomalie»: non è un ritocco dei conti, è un "ho visto, va bene così".
ipcMain.handle('cedolini:risolvi-anomalie', (_ev, { id, risolte }) =>
  rispondi(() => {
    richiediSessione()
    const info = db.prepare('update cedolini set anomalie_risolte = ? where id = ?').run(risolte ? 1 : 0, id)
    if (info.changes === 0) throw new Error('Cedolino non trovato.')
    registra(`cedolino ${id}: anomalie ${risolte ? 'archiviate come sistemate' : 'riaperte'}`)
    return null
  }),
)

ipcMain.handle('cedolini:apri', (_ev, id) =>
  rispondi(() => {
    richiediSessione()
    const r = db.prepare('select file from cedolini where id = ?').get(id)
    if (!r || !r.file || !fs.existsSync(r.file)) throw new Error('File PDF non trovato in archivio.')
    void shell.openPath(r.file)
    return null
  }),
)

ipcMain.handle('cedolini:elimina', (_ev, id) =>
  rispondi(() => {
    richiediAdmin()
    const r = db.prepare('select file from cedolini where id = ?').get(id)
    if (r && r.file) {
      try {
        fs.unlinkSync(r.file)
      } catch {
        /* già assente */
      }
    }
    db.prepare('delete from cedolini where id = ?').run(id)
    return null
  }),
)

// ---------- IPC: benzina ----------
ipcMain.handle('benzina:list', () =>
  rispondi(() => {
    richiediSessione()
    return db.prepare('select mese, prezzo, fonte from benzina order by mese desc').all()
  }),
)

ipcMain.handle('benzina:completa', () =>
  rispondi(() => {
    richiediSessione()
    return assicuraPrezziBenzina()
  }),
)

ipcMain.handle('benzina:imposta', (_ev, { mese, prezzo }) =>
  rispondi(() => {
    richiediSessione()
    if (!/^\d{4}-\d{2}$/.test(String(mese))) throw new Error('Mese non valido.')
    const p = Number(prezzo)
    if (!Number.isFinite(p) || p < 0) throw new Error('Prezzo non valido.')
    if (p === 0) {
      db.prepare('delete from benzina where mese = ?').run(mese)
      return null
    }
    db.prepare("insert or replace into benzina (mese, prezzo, fonte) values (?, ?, 'inserito a mano')").run(mese, p)
    return null
  }),
)

// ---------- IPC: tariffe ----------
ipcMain.handle('tariffe:list', () =>
  rispondi(() => {
    richiediSessione()
    return tutteLeTariffe()
  }),
)

ipcMain.handle('tariffe:salva', (_ev, r) =>
  rispondi(() => {
    richiediAdmin()
    const valore = Number(r.valore)
    if (!Number.isFinite(valore)) throw new Error('Valore non valido.')
    if (!/^\d{4}-\d{2}$/.test(String(r.dal))) throw new Error("Decorrenza non valida (usa l'anno-mese).")
    if (r.id) {
      db.prepare('update tariffe set valore = ?, dal = ?, note = ? where id = ?').run(
        valore, r.dal, pulisci(r.note), r.id,
      )
    } else {
      db.prepare('insert into tariffe (id, tipo, valore, dal, note) values (?, ?, ?, ?, ?)').run(
        crypto.randomUUID(), String(r.tipo), valore, r.dal, pulisci(r.note),
      )
    }
    return null
  }),
)

ipcMain.handle('tariffe:elimina', (_ev, id) =>
  rispondi(() => {
    richiediAdmin()
    db.prepare('delete from tariffe where id = ?').run(id)
    return null
  }),
)

// ---------- IPC: incarichi ----------
ipcMain.handle('incarichi:list', () =>
  rispondi(() => {
    richiediSessione()
    return db.prepare('select * from incarichi order by dal desc, iscrizione').all()
  }),
)

ipcMain.handle('incarichi:salva', (_ev, r) =>
  rispondi(() => {
    richiediSessione()
    const iscrizione = pulisci(r.iscrizione)
    if (!iscrizione) throw new Error('Numero di iscrizione obbligatorio.')
    if (r.id) {
      db.prepare('update incarichi set iscrizione = ?, dal = ?, al = ?, sede = ?, note = ? where id = ?').run(
        iscrizione, pulisci(r.dal), pulisci(r.al), pulisci(r.sede), pulisci(r.note), r.id,
      )
    } else {
      db.prepare('insert into incarichi (id, iscrizione, dal, al, sede, note) values (?, ?, ?, ?, ?, ?)').run(
        crypto.randomUUID(), iscrizione, pulisci(r.dal), pulisci(r.al), pulisci(r.sede), pulisci(r.note),
      )
    }
    return null
  }),
)

ipcMain.handle('incarichi:elimina', (_ev, id) =>
  rispondi(() => {
    richiediSessione()
    db.prepare('delete from incarichi where id = ?').run(id)
    return null
  }),
)

// ---------- IPC: dati (cartella, esportazione) ----------
ipcMain.handle('dati:info', () =>
  rispondi(() => {
    richiediSessione()
    const dir = cartellaDati()
    let dimensione = 0
    try {
      dimensione = fs.statSync(path.join(dir, 'cacca.db')).size
    } catch {
      /* db appena creato */
    }
    return { cartella: dir, dimensione }
  }),
)

const FORMATO_ESPORTAZIONE = 'cacca-dati-1'

ipcMain.handle('dati:esporta', async () => {
  try {
    const s = richiediSessione()
    const oggi = new Date().toISOString().slice(0, 10)
    const scelta = await dialog.showSaveDialog({
      title: 'Esporta dati CACCA',
      defaultPath: `CACCA-dati-${oggi}.caccadati`,
      filters: [{ name: 'Dati CACCA', extensions: ['caccadati'] }],
    })
    if (scelta.canceled || !scelta.filePath) return { data: null, error: null }
    const pacchetto = {
      formato: FORMATO_ESPORTAZIONE,
      versione_app: app.getVersion(),
      esportato_il: new Date().toISOString(),
      esportato_da: s.email,
      postazioni: db.prepare('select * from postazioni').all(),
      turni: db.prepare('select * from turni').all(),
      reperibilita: db.prepare('select * from reperibilita').all(),
      tariffe: db.prepare('select * from tariffe').all(),
      benzina: db.prepare('select * from benzina').all(),
      incarichi: db.prepare('select * from incarichi').all(),
      cedolini: db.prepare('select * from cedolini').all(),
    }
    fs.writeFileSync(scelta.filePath, JSON.stringify(pacchetto, null, 1), 'utf8')
    return { data: { percorso: scelta.filePath }, error: null }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

// ---------- IPC: archivio online cifrato ----------
// L'archivio resta un file su questo computer, ma viene anche depositato
// online in forma cifrata: così lo ritrovi da un altro computer. La chiave
// nasce dalla password e non lascia mai la macchina.

/** Chiavi dell'archivio online per la sessione in corso (mai su disco). */
let chiaviOnline = null

function statoOnlineLocale() {
  const riga = db.prepare("select v from app_meta where k = 'online'").get()
  if (!riga) return { attivo: false }
  try {
    const v = JSON.parse(riga.v)
    return { attivo: Boolean(v.attivo), email: v.email, sale: v.sale, ultimoInvio: v.ultimoInvio || null }
  } catch {
    return { attivo: false }
  }
}

function scriviStatoOnlineLocale(valore) {
  db.prepare("insert or replace into app_meta (k, v) values ('online', ?)").run(JSON.stringify(valore))
}

/** Tutti i dati di lavoro in un unico pacchetto (è ciò che viene cifrato). */
function pacchettoDati() {
  return {
    formato: FORMATO_ESPORTAZIONE,
    versione_app: app.getVersion(),
    creato_il: new Date().toISOString(),
    utenti: db.prepare('select * from utenti').all(),
    preferenze: db.prepare('select * from preferenze').all(),
    postazioni: db.prepare('select * from postazioni').all(),
    turni: db.prepare('select * from turni').all(),
    reperibilita: db.prepare('select * from reperibilita').all(),
    tariffe: db.prepare('select * from tariffe').all(),
    benzina: db.prepare('select * from benzina').all(),
    incarichi: db.prepare('select * from incarichi').all(),
    cedolini: db.prepare('select * from cedolini').all(),
  }
}

/** Rimette in archivio un pacchetto arrivato dall'online (sostituisce tutto). */
function applicaPacchetto(p) {
  const tabelle = ['utenti', 'preferenze', 'postazioni', 'turni', 'reperibilita', 'tariffe', 'benzina', 'incarichi', 'cedolini']
  const tx = db.transaction(() => {
    for (const t of tabelle) {
      if (!Array.isArray(p[t])) continue
      db.prepare(`delete from ${t}`).run()
      for (const riga of p[t]) {
        const colonne = Object.keys(riga)
        if (!colonne.length) continue
        db.prepare(
          `insert or replace into ${t} (${colonne.join(', ')}) values (${colonne.map(() => '?').join(', ')})`,
        ).run(...colonne.map((c) => riga[c]))
      }
    }
  })
  tx()
}

/** Invia online la fotografia attuale dell'archivio. */
async function inviaOnline() {
  const stato = statoOnlineLocale()
  if (!stato.attivo || !chiaviOnline) return null
  const contenuto = Buffer.from(JSON.stringify(pacchettoDati()), 'utf8')
  const versione = await online.salva(stato.email, chiaviOnline.accesso, chiaviOnline.chiave, contenuto, os.hostname())
  scriviStatoOnlineLocale({ ...stato, ultimoInvio: new Date().toISOString() })
  registra(`archivio online aggiornato (versione ${versione}, ${contenuto.length} byte in chiaro)`)
  return versione
}

ipcMain.handle('online:stato', () =>
  rispondi(() => {
    richiediSessione()
    const s = statoOnlineLocale()
    return { ...s, sbloccato: Boolean(chiaviOnline), indirizzo: online.URL_BASE }
  }),
)

// Passo 1: che cosa c'è già online per questo indirizzo?
ipcMain.handle('online:controlla', async (_ev, email) => {
  try {
    richiediSessione()
    return { data: await online.stato(email), error: null }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

// Passo 2: attiva l'archivio online (crea o si aggancia a quello esistente).
// modo: 'carica' = i dati di questo computer diventano quelli online
//       'scarica' = i dati online sostituiscono quelli di questo computer
ipcMain.handle('online:attiva', async (_ev, { email, password, modo }) => {
  try {
    const s = richiediSessione()
    const indirizzo = String(email || s.email).trim().toLowerCase()
    if (!password) throw new Error('Serve la password per creare la chiave di cifratura.')

    const presente = await online.stato(indirizzo)
    let chiavi
    if (presente.esiste) {
      chiavi = await online.apri(indirizzo, password, presente.sale)
      chiaviOnline = chiavi
      if (modo === 'scarica') {
        const scaricato = await online.leggi(indirizzo, chiavi.accesso, chiavi.chiave)
        if (!scaricato) throw new Error('L\'archivio online risulta vuoto: non c\'è nulla da scaricare.')
        const copia = path.join(cartellaDati(), `prima-del-download-${new Date().toISOString().slice(0, 10)}.db`)
        await db.backup(copia)
        applicaPacchetto(JSON.parse(scaricato.contenuto.toString('utf8')))
        registra(`archivio online scaricato (copia di sicurezza in ${copia})`)
      }
      scriviStatoOnlineLocale({ attivo: true, email: indirizzo, sale: presente.sale })
      if (modo !== 'scarica') await inviaOnline()
    } else {
      chiavi = await online.crea(indirizzo, password)
      chiaviOnline = chiavi
      scriviStatoOnlineLocale({ attivo: true, email: indirizzo, sale: chiavi.sale })
      await inviaOnline()
    }

    // da qui in poi il file locale è solo una copia di lavoro: l'originale
    // viene messo da parte con un nome che lo dice chiaramente
    try {
      const segnaposto = path.join(cartellaDati(), 'IL-DATABASE-ORA-E-ONLINE.txt')
      fs.writeFileSync(
        segnaposto,
        `L'archivio di CACCA è ora depositato online in forma cifrata (${online.URL_BASE}).\n` +
          `Il file cacca.db resta qui come copia di lavoro e viene riallineato a ogni avvio.\n` +
          `Archivio online di: ${indirizzo}\nAttivato il ${new Date().toLocaleString('it-IT')}\n`,
        'utf8',
      )
    } catch {
      /* il promemoria non è indispensabile */
    }
    return { data: statoOnlineLocale(), error: null }
  } catch (e) {
    chiaviOnline = null
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

// Sblocco all'avvio (o dopo il login) di un archivio online già attivo.
ipcMain.handle('online:sblocca', async (_ev, { password }) => {
  try {
    richiediSessione()
    const s = statoOnlineLocale()
    if (!s.attivo) throw new Error('Archivio online non attivo su questo computer.')
    const chiavi = await online.apri(s.email, password, s.sale)
    chiaviOnline = chiavi
    const scaricato = await online.leggi(s.email, chiavi.accesso, chiavi.chiave)
    if (scaricato) {
      applicaPacchetto(JSON.parse(scaricato.contenuto.toString('utf8')))
      registra(`archivio online riportato in locale (versione ${scaricato.versione})`)
    }
    return { data: { versione: scaricato ? scaricato.versione : 0 }, error: null }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

ipcMain.handle('online:invia', async () => {
  try {
    richiediSessione()
    const versione = await inviaOnline()
    return { data: { versione }, error: null }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

ipcMain.handle('online:disattiva', async (_ev, { elimina }) => {
  try {
    richiediSessione()
    const s = statoOnlineLocale()
    if (!s.attivo) return { data: null, error: null }
    if (elimina) {
      if (!chiaviOnline) throw new Error('Sblocca prima l\'archivio online con la password.')
      await online.elimina(s.email, chiaviOnline.accesso)
    }
    scriviStatoOnlineLocale({ attivo: false })
    chiaviOnline = null
    try {
      fs.unlinkSync(path.join(cartellaDati(), 'IL-DATABASE-ORA-E-ONLINE.txt'))
    } catch {
      /* non c'era */
    }
    registra(`archivio online disattivato${elimina ? ' ed eliminato dal server' : ''}`)
    return { data: null, error: null }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

ipcMain.handle('dati:apri-cartella', () =>
  rispondi(() => {
    richiediSessione()
    void shell.openPath(cartellaDati())
    return null
  }),
)

ipcMain.handle('app:versione', () => app.getVersion())

// ---------- prima sistemazione sul computer ----------
// Se il programma viene avviato dai download (o da una chiavetta), si propone
// di sistemarsi in una cartella stabile FUORI dal profilo utente: D:\CACCA se
// esiste il disco D:, altrimenti la cartella dell'utente.
function cartellaCasa() {
  try {
    if (fs.existsSync('D:\\')) return 'D:\\CACCA'
  } catch {
    /* niente D: */
  }
  const base = process.env.LOCALAPPDATA || app.getPath('appData')
  return path.join(base, 'CACCA')
}

function giaSistemato() {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE
  if (!exe) return true
  return path.dirname(exe).toLowerCase() === cartellaCasa().toLowerCase()
}

ipcMain.handle('sistemazione:stato', () => {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE
  return {
    data: {
      serve: Boolean(exe) && !giaSistemato() && !db.prepare("select v from app_meta where k = 'no_sistemazione'").get(),
      posizioneAttuale: exe ? path.dirname(exe) : '',
      destinazione: cartellaCasa(),
    },
    error: null,
  }
})

ipcMain.handle('sistemazione:rifiuta', () =>
  rispondi(() => {
    db.prepare("insert or replace into app_meta (k, v) values ('no_sistemazione', 'si')").run()
    return null
  }),
)

/** Se la cartella scelta non si chiama già CACCA, il programma vi crea dentro
 *  la propria cartella (es. Desktop → Desktop\CACCA). */
function proponiDestinazione(cartella) {
  return path.basename(cartella).toLowerCase() === 'cacca' ? cartella : path.join(cartella, 'CACCA')
}

// L'utente sfoglia e sceglie dove installare (es. Desktop, D:\, una chiavetta…).
ipcMain.handle('sistemazione:scegli-cartella', async () => {
  try {
    const scelta = await dialog.showOpenDialog({
      title: 'Scegli dove installare CACCA',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: fs.existsSync('D:\\') ? 'D:\\' : app.getPath('desktop'),
    })
    if (scelta.canceled || !scelta.filePaths[0]) return { data: null, error: null }
    return { data: proponiDestinazione(scelta.filePaths[0]), error: null }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

function eseguiSistemazione({ destinazione, collegamentoDesktop, collegamentoMenu }) {
  const origine = process.env.PORTABLE_EXECUTABLE_FILE
  if (!origine) throw new Error('Operazione disponibile solo nella versione portable.')
  const destinazioneCartella = pulisci(destinazione) || cartellaCasa()
  if (path.resolve(path.dirname(origine)) === path.resolve(destinazioneCartella)) {
    throw new Error('Il programma è già in quella cartella.')
  }
  const destinazioneExe = path.join(destinazioneCartella, 'CACCA.exe')

  fs.mkdirSync(destinazioneCartella, { recursive: true })
  fs.copyFileSync(origine, destinazioneExe)
  registra(`programma installato in ${destinazioneExe}`)

  // l'installazione è fatta: la nuova copia non deve riproporla, e la domanda
  // sui collegamenti è già stata fatta qui
  db.prepare("insert or replace into app_meta (k, v) values ('no_sistemazione', 'si')").run()
  db.prepare("insert or replace into app_meta (k, v) values ('collegamenti_chiesti', 'si')").run()

  // i dati eventualmente già inseriti viaggiano con il programma
  const datiOrigine = path.join(path.dirname(origine), 'dati')
  const datiDestinazione = path.join(destinazioneCartella, 'dati')
  try {
    if (db) db.close()
    db = null
    if (fs.existsSync(datiOrigine) && !fs.existsSync(datiDestinazione)) {
      fs.cpSync(datiOrigine, datiDestinazione, { recursive: true })
      registra('dati esistenti trasferiti nella nuova posizione')
    }
  } catch (e) {
    registra(`trasferimento dati non riuscito: ${String((e && e.message) || e)}`)
  }

  const p = percorsiCollegamenti()
  if (collegamentoDesktop) creaCollegamento(p.desktop, destinazioneExe)
  if (collegamentoMenu) creaCollegamento(p.menuAvvio, destinazioneExe)

  try {
    app.releaseSingleInstanceLock()
  } catch {
    /* ignora */
  }
  const { spawn } = require('node:child_process')
  const nuovo = spawn(destinazioneExe, ['--dopo-aggiornamento'], {
    detached: true,
    stdio: 'ignore',
    cwd: destinazioneCartella,
  })
  nuovo.unref()
  setTimeout(() => app.exit(0), 800)
  return { destinazione: destinazioneCartella }
}

ipcMain.handle('sistemazione:esegui', (_ev, scelte) => rispondi(() => eseguiSistemazione(scelte)))

// ---------- collegamenti (desktop / menu Start) ----------
function percorsoEseguibile() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
}

function percorsiCollegamenti() {
  const nome = 'CACCA.lnk'
  return {
    desktop: path.join(app.getPath('desktop'), nome),
    menuAvvio: path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', nome),
  }
}

function creaCollegamento(destinazione, bersaglioScelto) {
  const bersaglio = bersaglioScelto || percorsoEseguibile()
  fs.mkdirSync(path.dirname(destinazione), { recursive: true })
  const ok = shell.writeShortcutLink(destinazione, 'create', {
    target: bersaglio,
    cwd: path.dirname(bersaglio),
    description: 'CACCA — Calcolo Automatico Cedolini Continuità Assistenziale',
    icon: bersaglio,
    iconIndex: 0,
  })
  if (!ok) throw new Error('Windows non ha permesso di creare il collegamento.')
}

ipcMain.handle('collegamenti:stato', () =>
  rispondi(() => {
    const p = percorsiCollegamenti()
    return {
      desktop: fs.existsSync(p.desktop),
      menuAvvio: fs.existsSync(p.menuAvvio),
      giaChiesto: Boolean(db.prepare("select v from app_meta where k = 'collegamenti_chiesti'").get()),
    }
  }),
)

ipcMain.handle('collegamenti:crea', (_ev, { desktop, menuAvvio }) =>
  rispondi(() => {
    const p = percorsiCollegamenti()
    const fatti = []
    if (desktop) {
      creaCollegamento(p.desktop)
      fatti.push('desktop')
    }
    if (menuAvvio) {
      creaCollegamento(p.menuAvvio)
      fatti.push('menu Start')
    }
    db.prepare("insert or replace into app_meta (k, v) values ('collegamenti_chiesti', 'si')").run()
    registra(`collegamenti creati: ${fatti.join(', ') || 'nessuno'}`)
    return { fatti }
  }),
)

ipcMain.handle('collegamenti:rimanda', () =>
  rispondi(() => {
    db.prepare("insert or replace into app_meta (k, v) values ('collegamenti_chiesti', 'si')").run()
    return null
  }),
)

ipcMain.handle('collegamenti:mostra-cartella', () =>
  rispondi(() => {
    shell.showItemInFolder(percorsoEseguibile())
    return null
  }),
)

// ---------- aggiornamenti ----------
function registra(messaggio) {
  try {
    const riga = `${new Date().toISOString()}  ${messaggio}\n`
    fs.mkdirSync(cartellaDati(), { recursive: true })
    fs.appendFileSync(path.join(cartellaDati(), 'registro-aggiornamenti.txt'), riga)
  } catch {
    /* il registro non deve mai bloccare nulla */
  }
  console.log('[agg]', messaggio)
}

let statoAgg = {
  supportato: false,
  versioneCorrente: '',
  fase: 'inattivo', // inattivo | controllo | disponibile | download | installazione | errore
  percentuale: 0,
  disponibile: null,
  messaggio: '',
}

function inviaStatoAgg() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('agg:stato', statoAgg)
  }
}

function aggiornaStato(patch) {
  statoAgg = { ...statoAgg, ...patch }
  inviaStatoAgg()
}

async function controllaAggiornamenti() {
  if (!agg.aggiornamentoSupportato()) {
    registra('controllo saltato: non è la versione portable')
    aggiornaStato({ fase: 'inattivo', messaggio: 'Aggiornamento automatico attivo solo in versione portable.' })
    return null
  }
  registra(`controllo avviato (versione installata ${app.getVersion()})`)
  aggiornaStato({ fase: 'controllo', messaggio: '', percentuale: 0 })
  try {
    const info = await agg.cercaAggiornamento(app.getVersion())
    if (!info) {
      registra('controllo concluso: nessuna versione più recente')
      aggiornaStato({ fase: 'inattivo', disponibile: null, messaggio: '' })
      return null
    }
    registra(`controllo concluso: trovata versione ${info.versione}`)
    ultimoAggiornamento = info
    const precedenti = leggiTentativi()
    const falliti = precedenti.versione === info.versione ? precedenti.tentativi : 0
    info.autoInstalla = falliti < MAX_TENTATIVI
    if (!info.autoInstalla) {
      registra(`installazione automatica sospesa: ${falliti} tentativi falliti per la ${info.versione}`)
    }
    aggiornaStato({
      fase: 'disponibile',
      disponibile: { versione: info.versione, note: info.note },
      messaggio: '',
    })
    return info
  } catch (e) {
    registra(`controllo fallito: ${String((e && e.message) || e)}`)
    aggiornaStato({ fase: 'errore', messaggio: String((e && e.message) || e) })
    return null
  }
}

/** @type {null | object} */
let ultimoAggiornamento = null

const MAX_TENTATIVI = 3
const FILE_TENTATIVI = 'stato-aggiornamento.json'

function leggiTentativi() {
  try {
    const dati = JSON.parse(fs.readFileSync(path.join(cartellaDati(), FILE_TENTATIVI), 'utf8'))
    return { versione: String(dati.versione || ''), tentativi: Number(dati.tentativi) || 0 }
  } catch {
    return { versione: '', tentativi: 0 }
  }
}

function segnaTentativo(versione) {
  const attuale = leggiTentativi()
  const tentativi = attuale.versione === versione ? attuale.tentativi + 1 : 1
  try {
    fs.writeFileSync(
      path.join(cartellaDati(), FILE_TENTATIVI),
      JSON.stringify({ versione, tentativi, ultimo: new Date().toISOString() }, null, 2),
    )
  } catch {
    /* ignora */
  }
  registra(`tentativo di installazione n. ${tentativi} per la versione ${versione}`)
  return tentativi
}

function azzeraTentativi() {
  try {
    fs.unlinkSync(path.join(cartellaDati(), FILE_TENTATIVI))
  } catch {
    /* non esiste: ok */
  }
}

async function installaAggiornamento() {
  if (!ultimoAggiornamento) throw new Error('Nessun aggiornamento da installare.')
  segnaTentativo(ultimoAggiornamento.versione)
  registra(`download avviato: versione ${ultimoAggiornamento.versione}`)
  aggiornaStato({ fase: 'download', percentuale: 0, messaggio: '' })
  const file = await agg.scaricaAggiornamento(ultimoAggiornamento, (p) => aggiornaStato({ percentuale: p }))
  registra(`download completato e impronta verificata: ${file}`)
  aggiornaStato({ fase: 'installazione', percentuale: 100 })

  // Versione portable: sostituzione diretta; se non riesce, script di riserva.
  let conScript = false
  try {
    agg.sostituisciSenzaScript(file)
    registra('eseguibile sostituito direttamente')
  } catch (e) {
    registra(`sostituzione diretta non riuscita (${String((e && e.message) || e)}): uso lo script di riserva`)
    agg.avviaSostituzione(file)
    conScript = true
  }

  setTimeout(() => {
    if (db) db.close()
    if (!conScript) {
      try {
        app.releaseSingleInstanceLock()
      } catch {
        /* ignora */
      }
      try {
        const { spawn } = require('node:child_process')
        const exe = agg.eseguibilePortable()
        const p = spawn(exe, ['--dopo-aggiornamento'], {
          detached: true,
          stdio: 'ignore',
          cwd: path.dirname(exe),
        })
        p.unref()
        registra('nuova versione avviata')
      } catch (e) {
        registra(`riavvio non riuscito: ${String((e && e.message) || e)}`)
      }
    }
    app.exit(0)
  }, 1200)
}

ipcMain.handle('agg:stato', () => {
  registra(`interfaccia: stato richiesto (supportato=${statoAgg.supportato}, fase=${statoAgg.fase})`)
  return { data: statoAgg, error: null }
})

ipcMain.handle('agg:controlla', async () => {
  try {
    const info = await controllaAggiornamenti()
    return {
      data: info ? { versione: info.versione, note: info.note, autoInstalla: info.autoInstalla !== false } : null,
      error: null,
    }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

ipcMain.handle('agg:installa', async () => {
  registra('interfaccia: installazione richiesta')
  try {
    await installaAggiornamento()
    return { data: null, error: null }
  } catch (e) {
    const messaggio = String((e && e.message) || e)
    registra(`installazione fallita: ${messaggio}`)
    aggiornaStato({ fase: 'errore', messaggio })
    return { data: null, error: { message: messaggio } }
  }
})

// ---------- finestra ----------
const MISURE_PREDEFINITE = { width: 1360, height: 860 }

function leggiGeometria() {
  try {
    const riga = db.prepare("select v from app_meta where k = 'finestra'").get()
    if (!riga) return null
    const g = JSON.parse(riga.v)
    if (!g || typeof g.width !== 'number' || typeof g.height !== 'number') return null
    if (typeof g.x === 'number' && typeof g.y === 'number') {
      const schermi = screen.getAllDisplays()
      const visibile = schermi.some(
        (s) =>
          g.x + g.width > s.bounds.x &&
          g.x < s.bounds.x + s.bounds.width &&
          g.y + g.height > s.bounds.y &&
          g.y < s.bounds.y + s.bounds.height,
      )
      if (!visibile) {
        delete g.x
        delete g.y
      }
    }
    return g
  } catch {
    return null
  }
}

function salvaGeometria(win) {
  try {
    if (!win || win.isDestroyed() || !db) return
    const massimizzata = win.isMaximized()
    const b = massimizzata ? win.getNormalBounds() : win.getBounds()
    db.prepare("insert or replace into app_meta (k, v) values ('finestra', ?)").run(
      JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, massimizzata }),
    )
  } catch {
    /* non deve mai disturbare l'uso del programma */
  }
}

function creaFinestra() {
  const g = leggiGeometria()
  const win = new BrowserWindow({
    width: g?.width ?? MISURE_PREDEFINITE.width,
    height: g?.height ?? MISURE_PREDEFINITE.height,
    ...(typeof g?.x === 'number' && typeof g?.y === 'number' ? { x: g.x, y: g.y } : {}),
    minWidth: 1000,
    minHeight: 640,
    title: 'CACCA — Calcolo Automatico Cedolini Continuità Assistenziale',
    backgroundColor: '#E6F0F8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (g?.massimizzata) win.maximize()

  for (const evento of ['resized', 'moved', 'maximize', 'unmaximize']) {
    win.on(evento, () => salvaGeometria(win))
  }
  win.on('close', () => salvaGeometria(win))
  Menu.setApplicationMenu(null)

  win.webContents.on('preload-error', (_e, percorso, errore) => {
    registra(`ERRORE nel ponte (preload ${percorso}): ${errore && errore.message}`)
  })
  win.webContents.on('console-message', (_e, livello, messaggio, riga, sorgente) => {
    if (livello >= 2) registra(`finestra [errore] ${messaggio} (${sorgente}:${riga})`)
    else if (/\[CACCA\]/.test(String(messaggio))) registra(`finestra ${messaggio}`)
  })
  win.webContents.on('did-finish-load', () => {
    registra('finestra: interfaccia caricata')
    // la finestra deve prendersi la tastiera: se un'altra finestra è passata
    // davanti durante l'avvio, senza questo si digita "nel vuoto"
    if (!win.isDestroyed()) {
      win.show()
      win.focus()
    }
  })
  win.webContents.on('render-process-gone', (_e, dettagli) =>
    registra(`finestra terminata: ${dettagli && dettagli.reason}`),
  )

  void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  return win
}

// ---------- smoke test (collaudo automatico senza finestra) ----------
// Non tocca MAI il database reale: lavora su una copia usa e getta. Se trova
// il file di precaricamento con i dati veri, verifica i calcoli CONTRO I
// CEDOLINI REALI: ogni voce deve tornare al centesimo.
const FILE_TEST = '_collaudo.db'

function rimuoviDbTest() {
  for (const suffisso of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(path.join(cartellaDati(), FILE_TEST + suffisso))
    } catch {
      /* non esiste: ok */
    }
  }
}

function quasiUguale(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.005
}

function smoke() {
  const rapporto = {}
  try {
    rimuoviDbTest()
    apriDb(FILE_TEST)
    rapporto.cartella_dati = cartellaDati()

    // --- utenti e password
    const id = crypto.randomUUID()
    const mail = `smoke.${id.slice(0, 6)}@test.local`
    const uid = inserisciUtente({ nome: 'Prova', cognome: 'Smoke', email: mail, password: 'password123', ruolo: 'admin' })
    const u = db.prepare('select * from utenti where id = ?').get(uid)
    rapporto.password_giusta = passwordCorretta(u, 'password123')
    rapporto.password_sbagliata_respinta = !passwordCorretta(u, 'sbagliata!')
    rapporto.hash_non_in_chiaro = !String(u.pwd_hash).includes('password123')
    const sessioneAdmin = { id: uid, ruolo: 'admin', email: mail }
    const sessioneUtente = { id: 'x', ruolo: 'utente', email: 'tale@test.local' }
    rapporto.elenco_admin_ok = Array.isArray(elencoUtenti(sessioneAdmin))
    let negato = false
    try {
      elencoUtenti(sessioneUtente)
    } catch {
      negato = true
    }
    rapporto.elenco_negato_a_utente = negato

    // --- motore: date e superfestivi
    rapporto.pasqua_2026 = motore.pasqua(2026)
    rapporto.pasqua_ok = motore.pasqua(2026) === '2026-04-05' && motore.pasqua(2025) === '2025-04-20'
    rapporto.sf_pasquetta = motore.oreSuperfestiveAuto('2026-04-06', 'fest12') === 12
    rapporto.sf_2giugno_24h = motore.oreSuperfestiveAuto('2026-06-02', 'fest24') === 12
    rapporto.sf_1maggio = motore.oreSuperfestiveAuto('2026-05-01', 'fest12') === 12
    rapporto.sf_capodanno_notte = motore.oreSuperfestiveAuto('2025-12-31', 'nott12') === 12
    rapporto.sf_natale_24h = motore.oreSuperfestiveAuto('2026-12-25', 'fest24') === 24
    rapporto.sf_giorno_qualunque = motore.oreSuperfestiveAuto('2026-03-11', 'nott12') === 0
    rapporto.valuta_giugno_anticipata = motore.dataValuta('2026-06') === '2026-06-26'
    rapporto.valuta_agosto = motore.dataValuta('2026-08') === '2026-08-27'
    rapporto.motore_ok =
      rapporto.pasqua_ok &&
      rapporto.sf_pasquetta &&
      rapporto.sf_2giugno_24h &&
      rapporto.sf_1maggio &&
      rapporto.sf_capodanno_notte &&
      rapporto.sf_natale_24h &&
      rapporto.sf_giorno_qualunque &&
      rapporto.valuta_giugno_anticipata &&
      rapporto.valuta_agosto

    // --- verifica CONTRO I CEDOLINI VERI (solo se il seed è presente)
    const fileSeed = path.join(__dirname, 'seed-dati.json')
    if (fs.existsSync(fileSeed)) {
      const seed = JSON.parse(fs.readFileSync(fileSeed, 'utf8'))
      applicaSeed(seed)
      const dettagli = []
      let vociOk = 0
      let vociNo = 0
      const anomalieTrovate = []
      for (const ced of db.prepare('select rata from cedolini order by rata').all()) {
        const esito = riconciliaRata(ced.rata)
        for (const riga of esito.righe) {
          if (riga.voce.startsWith('Chilometrico')) {
            // il prezzo benzina del seed viene dal cedolino stesso: deve combaciare
            if (quasiUguale(riga.atteso ?? riga.pagato, riga.pagato)) vociOk++
            else {
              vociNo++
              dettagli.push(`${ced.rata} ${riga.voce}: atteso ${riga.atteso} pagato ${riga.pagato}`)
            }
            continue
          }
          if (riga.ok) vociOk++
          else anomalieTrovate.push(`${ced.rata}|${riga.voce}|delta ${riga.delta}`)
        }
      }
      rapporto.cedolini_verificati = db.prepare('select count(*) as n from cedolini').get().n
      rapporto.voci_combacianti = vociOk
      rapporto.voci_divergenti_impreviste = vociNo
      rapporto.dettagli_divergenze = dettagli
      // le UNICHE differenze ammesse sono le 3 anomalie vere trovate nell'analisi:
      // rata 2026-05: reperibilità di aprile non pagate (delta -140,36)
      // rata 2026-06: superfestivo 1/5 non pagato (delta -180)
      // rata 2026-07: superfestivo 2/6 non pagato (delta -180)
      const attese = [
        '2026-05|Reperibilità (voce 27)|delta -140.36',
        '2026-06|Superfestivo (voce 46)|delta -180',
        '2026-07|Superfestivo (voce 46)|delta -180',
      ]
      rapporto.anomalie_trovate = anomalieTrovate
      rapporto.anomalie_ok =
        anomalieTrovate.length === attese.length && attese.every((a) => anomalieTrovate.includes(a))

      // Rata APRILE: l'unica senza arretrati né anomalie → il netto ricalcolato
      // deve coincidere al centesimo con quello NoiPA.
      const apr = riconciliaRata('2026-04')
      rapporto.netto_aprile = { atteso: apr.atteso.totale.netto, noipa: apr.cedolino.netto }
      // Rata GENNAIO: NoiPA non pagò le 7 reperibilità di dicembre (recuperate a
      // febbraio): al netto di quelle, il lordo deve coincidere.
      const gen = riconciliaRata('2026-01')
      rapporto.lordo_gennaio_senza_rep = motore.round2(gen.atteso.totale.lordo - gen.atteso.totale.importi.reperibilita)
      rapporto.netti_ok =
        quasiUguale(apr.atteso.totale.netto, apr.cedolino.netto) &&
        quasiUguale(apr.atteso.totale.lordo, 5225.94) &&
        quasiUguale(rapporto.lordo_gennaio_senza_rep, 3707.94)

      rapporto.seed = 'verificato'
      rapporto.seed_ok = vociNo === 0 && rapporto.anomalie_ok && rapporto.netti_ok
    } else {
      rapporto.seed = 'assente (nessuna verifica sui cedolini reali)'
      rapporto.seed_ok = true
    }

    // --- confronto nomi delle sedi (la domanda "è la stessa postazione?")
    const sim = (a, b) => Math.round(motore.somiglianzaNomi(a, b) * 100)
    rapporto.somiglianza_notte_abbreviata = sim('PALOMBARA NOt', 'Palombara Notte') // caso reale
    rapporto.somiglianza_guidonia = sim('GUIDONIA', 'Guidonia / Palombara Giorno')
    rapporto.somiglianza_estranea = sim('TIVOLI', 'Palombara Notte')
    rapporto.nomi_ok =
      rapporto.somiglianza_notte_abbreviata >= 90 &&
      rapporto.somiglianza_guidonia >= 70 &&
      rapporto.somiglianza_estranea === 0 &&
      motore.normalizzaTesto('Palombara (PPI) — notte') === 'PALOMBARA PPI NOTTE'

    // la sede già collegata non fa più domande; una sconosciuta sì
    const finte = [
      { id: 'a', nome: 'Palombara Notte', nome_excel: 'PALOMBARA NOTTE', sede_cedolino: 'PALOMBARA (PPI)' },
      { id: 'b', nome: 'Guidonia / Palombara Giorno', nome_excel: 'GUIDONIA/PALOMBARA GIORNO', sede_cedolino: null },
    ]
    const giaNota = motore.cercaPostazionePerSede('PALOMBARA (PPI)', finte)
    const daChiedere = motore.cercaPostazionePerSede('GUIDONIA', finte)
    const mai = motore.cercaPostazionePerSede('OSPEDALE DI TIVOLI', finte)
    rapporto.sede_gia_collegata = giaNota.esatta && giaNota.postazione.id === 'a'
    rapporto.sede_da_confermare = !daChiedere.esatta && daChiedere.postazione?.id === 'b'
    rapporto.sede_sconosciuta_senza_candidato = !mai.esatta && mai.postazione === null
    rapporto.sedi_ok =
      rapporto.sede_gia_collegata && rapporto.sede_da_confermare && rapporto.sede_sconosciuta_senza_candidato

    // --- postazioni: una con turni non si cancella, una vuota sì
    const idPiena = crypto.randomUUID()
    const idVuota = crypto.randomUUID()
    db.prepare('insert into postazioni (id, nome, nome_excel, ordine) values (?, ?, ?, 90)').run(
      idPiena, 'Prova piena', 'PROVA PIENA',
    )
    db.prepare('insert into postazioni (id, nome, nome_excel, ordine) values (?, ?, ?, 91)').run(
      idVuota, 'Prova vuota', 'PROVA VUOTA',
    )
    db.prepare('insert into turni (id, data, postazione_id, tipo) values (?, ?, ?, ?)').run(
      crypto.randomUUID(), '2026-09-01', idPiena, 'nott12',
    )
    const turniPiena = db.prepare('select count(*) as n from turni where postazione_id = ?').get(idPiena).n
    rapporto.postazione_piena_bloccata = turniPiena > 0
    db.prepare('delete from postazioni where id = ?').run(idVuota)
    rapporto.postazione_vuota_eliminata = !db.prepare('select id from postazioni where id = ?').get(idVuota)
    db.prepare('delete from turni where postazione_id = ?').run(idPiena)
    db.prepare('delete from postazioni where id = ?').run(idPiena)

    // --- archivio online: cifratura e ciclo completo sul server vero
    const salePr = online.nuovoSale()
    const chiaviA = online.derivaChiavi('password-di-prova', salePr)
    const chiaviB = online.derivaChiavi('password-sbagliata', salePr)
    const segreto = Buffer.from(JSON.stringify({ turni: 108, nota: 'dati riservati' }), 'utf8')
    const cifrato = online.cifra(segreto, chiaviA.chiave)
    rapporto.cifratura_illeggibile = !Buffer.from(cifrato, 'base64').includes(Buffer.from('dati riservati'))
    rapporto.cifratura_ritorno = online.decifra(cifrato, chiaviA.chiave).toString('utf8') === segreto.toString('utf8')
    let pwdSbagliataRespinta = false
    try {
      online.decifra(cifrato, chiaviB.chiave)
    } catch {
      pwdSbagliataRespinta = true
    }
    rapporto.cifratura_password_sbagliata_respinta = pwdSbagliataRespinta
    rapporto.chiave_diversa_da_accesso = !chiaviA.chiave.toString('hex').includes(chiaviA.accesso.slice(0, 16))
    rapporto.online_ok =
      rapporto.cifratura_illeggibile &&
      rapporto.cifratura_ritorno &&
      rapporto.cifratura_password_sbagliata_respinta &&
      rapporto.chiave_diversa_da_accesso

    // --- excel: composizione riepilogo di prova
    const prova = excel.componiRiepilogo({
      mese: '2026-01',
      postazione: { nome_excel: 'PROVA', suffisso_foglio: '' },
      medico: { cognome: 'ROSSI', nome: 'MARIO' },
      turni: [
        { data: '2026-01-02', tipo: 'nott12', superfestivo_ore: 0 },
        { data: '2026-01-04', tipo: 'fest24', superfestivo_ore: 0 },
      ],
      reperibilita: [{ data: '2026-01-05', quantita: 2 }],
    })
    rapporto.excel_totale_ore = prova.totaleOre
    rapporto.excel_totale_rep = prova.totaleRep
    rapporto.excel_ok = prova.totaleOre === 36 && prova.totaleRep === 2 && prova.nomeFoglio === 'GENNAIO 2026'

    // --- lettura cedolino (testo sintetico nel formato NoiPA)
    // dati di prova INVENTATI: qui non deve comparire nulla di reale
    // (lo script di rilascio controlla il pacchetto proprio su questo)
    const testoProva = [
      'RATA: Gennaio 2026 ID CEDOLINO: 00000001',
      'N° iscrizione: 12345678',
      'Sede di servizio: POSTAZIONE DI PROVA',
      'Coord. IBAN: IT00X0000000000000000000000 Valuta/Esigibilità: 27 Gennaio 2026',
      '11 COMP. CHILOMETRICO 193,44',
      '40 ONORARIO PROFESSIONALE 2.764,50',
      '45 INCR. ONORARIO PROF. A.I.R. 570,00',
      '46 MAGG. ORARIA SUPERFESTIVO Qt 12,00 Uni 15,00 180,00',
      '27 TURNO REPERIBILITA\' A.I.R. Qt 7,00 Uni 35,09 Rif 12/25 245,63',
      'ENPAM Cassa PensioneAA.CC. 3.707,94 15,625 su 100 579,37',
      "RITENUTA D'ACCONTO 3.128,57 625,71",
      'Totale: 1.205,08 3.707,94',
      'Totale netto: 2.502,86',
    ].join('\n')
    const letto = motore.leggiCedolino(testoProva)
    rapporto.cedolino_rata = letto.rata
    rapporto.cedolino_ok =
      letto.rata === '2026-01' &&
      letto.iscrizione === '12345678' &&
      letto.voci.length === 5 &&
      letto.voci.find((v) => v.codice === '40')?.importo === 2764.5 &&
      letto.voci.find((v) => v.codice === '27')?.rif === '12/25' &&
      letto.voci.find((v) => v.codice === '46')?.qt === 12 &&
      letto.netto === 2502.86 &&
      letto.valuta === '2026-01-27' &&
      letto.enpam.length === 1

    // --- aggiornamenti
    rapporto.versioni_ordinate =
      agg.confrontaVersioni('1.0.1', '1.0.0') === 1 &&
      agg.confrontaVersioni('1.0.0', '1.0.1') === -1 &&
      agg.confrontaVersioni('v1.2.3', '1.2.3') === 0
    rapporto.agg_disattivato_fuori_portable = agg.aggiornamentoSupportato() === false

    // --- pulizia
    db.prepare('delete from preferenze where utente_id = ?').run(uid)
    db.prepare('delete from utenti where id = ?').run(uid)

    rapporto.ok =
      rapporto.password_giusta &&
      rapporto.password_sbagliata_respinta &&
      rapporto.hash_non_in_chiaro &&
      rapporto.elenco_admin_ok &&
      rapporto.elenco_negato_a_utente &&
      rapporto.motore_ok &&
      rapporto.nomi_ok &&
      rapporto.sedi_ok &&
      rapporto.postazione_piena_bloccata &&
      rapporto.postazione_vuota_eliminata &&
      rapporto.online_ok &&
      rapporto.seed_ok &&
      rapporto.excel_ok &&
      rapporto.cedolino_ok &&
      rapporto.versioni_ordinate &&
      rapporto.agg_disattivato_fuori_portable
  } catch (e) {
    rapporto.ok = false
    rapporto.errore = String((e && e.stack) || e)
  }
  try {
    if (db) db.close()
    db = null
    rimuoviDbTest()
    rapporto.db_collaudo_rimosso = true
  } catch {
    rapporto.db_collaudo_rimosso = false
  }
  try {
    fs.mkdirSync(cartellaDati(), { recursive: true })
    fs.writeFileSync(path.join(cartellaDati(), 'rapporto-smoke.json'), JSON.stringify(rapporto, null, 2))
  } catch {
    /* ignora */
  }
  console.log('[SMOKE]', JSON.stringify(rapporto))
  app.exit(rapporto.ok ? 0 : 1)
}

// ---------- avvio ----------
if (!SMOKE) {
  let lock = app.requestSingleInstanceLock()
  if (!lock && process.argv.includes('--dopo-aggiornamento')) {
    const attesa = new Int32Array(new SharedArrayBuffer(4))
    for (let i = 0; i < 30 && !lock; i++) {
      Atomics.wait(attesa, 0, 0, 400)
      lock = app.requestSingleInstanceLock()
    }
  }
  if (!lock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      const [win] = BrowserWindow.getAllWindows()
      if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    })
  }
}

app.whenReady().then(() => {
  if (SMOKE) {
    smoke()
    return
  }
  // Preparazione dati senza finestra: crea (o completa) l'archivio nella
  // cartella indicata da CACCA_DATI_DIR applicando l'eventuale seed, poi esce.
  if (process.argv.includes('--prepara-dati')) {
    try {
      apriDb()
      const n = db.prepare('select count(*) as n from turni').get().n
      console.log(`[PREPARA-DATI] archivio pronto in ${cartellaDati()} (turni: ${n})`)
      db.close()
      app.exit(0)
    } catch (e) {
      console.error('[PREPARA-DATI] errore:', String((e && e.message) || e))
      app.exit(1)
    }
    return
  }
  try {
    apriDb()
  } catch (e) {
    dialog.showErrorBox('CACCA — errore database', String((e && e.message) || e))
    app.exit(1)
    return
  }
  void backupAutomatico()
  try {
    const sistemati = assicuraPrezziBenzina()
    if (sistemati.length) registra(`prezzi benzina completati per ${sistemati.length} mesi`)
  } catch (e) {
    registra(`completamento prezzi benzina non riuscito: ${String((e && e.message) || e)}`)
  }

  statoAgg.supportato = agg.aggiornamentoSupportato()
  statoAgg.versioneCorrente = app.getVersion()
  agg.ripulisciVecchioEseguibile()
  const inSospeso = leggiTentativi()
  if (inSospeso.versione && agg.confrontaVersioni(app.getVersion(), inSospeso.versione) >= 0) {
    registra(`aggiornamento alla ${inSospeso.versione} completato con successo`)
    azzeraTentativi()
  }
  registra(
    `avvio applicazione ${app.getVersion()} — aggiornamento ${statoAgg.supportato ? 'attivo' : 'non disponibile'} ` +
      `(eseguibile: ${agg.eseguibilePortable() || 'non portable'})`,
  )
  creaFinestra()
  setInterval(() => {
    if (statoAgg.fase === 'inattivo' || statoAgg.fase === 'errore') void controllaAggiornamenti()
  }, 60 * 60 * 1000)
})

app.on('window-all-closed', () => {
  if (db) db.close()
  app.quit()
})
