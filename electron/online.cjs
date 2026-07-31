// CACCA — archivio online CIFRATO.
//
// Come funziona, in breve:
//  - i dati restano un normale archivio locale, ma vengono anche cifrati e
//    depositati online, così li ritrovi da un altro computer;
//  - la cifratura è AES-256-GCM e la chiave nasce dalla TUA password
//    (scrypt): la password e la chiave NON escono mai da questo computer;
//  - al server arriva soltanto un blocco di byte illeggibili. Chi guardasse
//    dentro il database vedrebbe caratteri a caso.
//  - le tabelle online non sono raggiungibili direttamente: si passa solo da
//    funzioni che pretendono una prova di accesso (anch'essa derivata dalla
//    password, ma diversa dalla chiave di cifratura).

'use strict'

const https = require('node:https')
const crypto = require('node:crypto')

const URL_BASE = 'https://lrvkchqvjzynfzevpqaj.supabase.co'
// chiave pubblica del progetto: da sola non apre nulla (serve la prova di accesso)
const CHIAVE_PUBBLICA =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxydmtjaHF2anp5bmZ6ZXZwcWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDY5NjksImV4cCI6MjA5MzIyMjk2OX0.XZXyUt9UNepHvr4HBLgCkywQYsXwtmvwYCsRrlAMBv4'
const TIMEOUT = 25000

/** Chiamata a una funzione del database online. */
function chiama(funzione, parametri) {
  return new Promise((risolvi, rifiuta) => {
    const corpo = Buffer.from(JSON.stringify(parametri || {}), 'utf8')
    const req = https.request(
      `${URL_BASE}/rest/v1/rpc/${funzione}`,
      {
        method: 'POST',
        headers: {
          apikey: CHIAVE_PUBBLICA,
          Authorization: `Bearer ${CHIAVE_PUBBLICA}`,
          'Content-Type': 'application/json',
          'Content-Length': corpo.length,
        },
      },
      (res) => {
        let dati = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (dati += c))
        res.on('end', () => {
          let risposta = null
          try {
            risposta = dati ? JSON.parse(dati) : null
          } catch {
            return rifiuta(new Error(`Risposta inattesa dal servizio online (${res.statusCode}).`))
          }
          if (res.statusCode >= 400) {
            const m = (risposta && (risposta.message || risposta.error_description)) || `errore ${res.statusCode}`
            return rifiuta(new Error(traduci(m)))
          }
          risolvi(risposta)
        })
      },
    )
    req.setTimeout(TIMEOUT, () => req.destroy(new Error('Il servizio online non risponde. Riprova più tardi.')))
    req.on('error', (e) =>
      rifiuta(new Error(`Non riesco a raggiungere il servizio online: ${String((e && e.message) || e)}`)),
    )
    req.end(corpo)
  })
}

function traduci(messaggio) {
  const m = String(messaggio || '')
  if (/accesso non consentito/i.test(m)) return 'Password non corretta per questo archivio online.'
  if (/duplicate key|già|unique/i.test(m)) return 'Esiste già un archivio online per questo indirizzo.'
  return m
}

// ---------------------------------------------------------------- chiavi
// Dalla password nascono due cose diverse e indipendenti:
//  - la CHIAVE di cifratura (resta qui, non la vede nessuno);
//  - la PROVA di accesso (viaggia, ma non permette di decifrare nulla).
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function derivaChiavi(password, sale) {
  const pwd = String(password || '')
  if (!pwd) throw new Error('Password mancante.')
  const chiave = crypto.scryptSync(pwd, `${sale}|cifratura`, 32, SCRYPT)
  const accesso = crypto.scryptSync(pwd, `${sale}|accesso`, 32, SCRYPT).toString('hex')
  return { chiave, accesso }
}

function nuovoSale() {
  return crypto.randomBytes(16).toString('hex')
}

function impronta(testo) {
  return crypto.createHash('sha256').update(String(testo)).digest('hex')
}

// ---------------------------------------------------------------- cifratura
/** Cifra un Buffer: il risultato è base64 di [iv | tag | testo cifrato]. */
function cifra(contenuto, chiave) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', chiave, iv)
  const cifrato = Buffer.concat([c.update(contenuto), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), cifrato]).toString('base64')
}

/** Decifra quanto prodotto da cifra(); fallisce se la password è sbagliata. */
function decifra(base64, chiave) {
  const tutto = Buffer.from(String(base64), 'base64')
  if (tutto.length < 29) throw new Error('Archivio online illeggibile.')
  const iv = tutto.subarray(0, 12)
  const tag = tutto.subarray(12, 28)
  const d = crypto.createDecipheriv('aes-256-gcm', chiave, iv)
  d.setAuthTag(tag)
  try {
    return Buffer.concat([d.update(tutto.subarray(28)), d.final()])
  } catch {
    throw new Error('Non riesco ad aprire l\'archivio online: password diversa da quella usata per crearlo.')
  }
}

// ---------------------------------------------------------------- operazioni

/** Che cosa c'è online per questo indirizzo? (non serve la password) */
async function stato(email) {
  const righe = await chiama('cacca_stato', { p_email: String(email || '').trim().toLowerCase() })
  const r = Array.isArray(righe) ? righe[0] : righe
  if (!r || !r.esiste) return { esiste: false }
  return {
    esiste: true,
    sale: r.sale,
    dispositivo: r.dispositivo,
    byte: r.byte,
    aggiornatoIl: r.aggiornato_il,
  }
}

/** Crea l'archivio online per questo indirizzo e ne restituisce le chiavi. */
async function crea(email, password) {
  const sale = nuovoSale()
  const { chiave, accesso } = derivaChiavi(password, sale)
  await chiama('cacca_crea', {
    p_email: String(email).trim().toLowerCase(),
    p_sale: sale,
    p_accesso_hash: impronta(accesso),
  })
  return { sale, chiave, accesso }
}

/** Apre un archivio già esistente: controlla la password sul server. */
async function apri(email, password, sale) {
  const { chiave, accesso } = derivaChiavi(password, sale)
  const ok = await chiama('cacca_verifica', { p_email: String(email).trim().toLowerCase(), p_accesso: accesso })
  if (ok !== true) throw new Error('Password non corretta per questo archivio online.')
  return { chiave, accesso }
}

/** Deposita online il contenuto (già cifrato qui dentro). */
async function salva(email, accesso, chiave, contenuto, dispositivo) {
  const versione = await chiama('cacca_salva', {
    p_email: String(email).trim().toLowerCase(),
    p_accesso: accesso,
    p_contenuto: cifra(contenuto, chiave),
    p_dispositivo: dispositivo || null,
  })
  return Number(versione) || 0
}

/** Riporta a casa il contenuto (decifrato). null se l'archivio è ancora vuoto. */
async function leggi(email, accesso, chiave) {
  const righe = await chiama('cacca_leggi', { p_email: String(email).trim().toLowerCase(), p_accesso: accesso })
  const r = Array.isArray(righe) ? righe[0] : righe
  if (!r || !r.contenuto) return null
  return { contenuto: decifra(r.contenuto, chiave), versione: r.versione, aggiornatoIl: r.aggiornato_il }
}

/** Spegne l'archivio online (i dati restano sul computer). */
async function elimina(email, accesso) {
  await chiama('cacca_elimina', { p_email: String(email).trim().toLowerCase(), p_accesso: accesso })
  return true
}

module.exports = {
  URL_BASE,
  stato,
  crea,
  apri,
  salva,
  leggi,
  elimina,
  derivaChiavi,
  cifra,
  decifra,
  impronta,
  nuovoSale,
}
