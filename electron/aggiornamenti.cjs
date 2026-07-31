// CACCA — aggiornamento automatico dell'eseguibile portable.
//
// Come funziona:
//  1. l'app chiede a GitHub qual è l'ultima versione pubblicata (Releases);
//  2. se è più recente, scarica il nuovo CACCA.exe in una cartella di appoggio;
//  3. verifica l'impronta SHA-256 dichiarata nella release: se non combacia, annulla;
//  4. sostituisce l'eseguibile (tenendo una copia di sicurezza) e riavvia.
//
// Regole di sicurezza:
//  - senza impronta SHA-256 valida NON si installa nulla;
//  - se qualcosa va storto si torna sempre all'eseguibile precedente;
//  - se GitHub non è raggiungibile l'app parte normalmente (mai bloccare il lavoro).

'use strict'

const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')

const REPO = 'marabellis-prog/caced'
const NOME_ASSET = 'CACCA.exe'
const NOME_MANIFESTO = 'aggiornamento.json'
const TIMEOUT_RETE = 15000

// ---------------------------------------------------------------- utilità

/** Confronta due versioni tipo "1.2.10". Ritorna 1 se a > b, -1 se a < b, 0 se uguali. */
function confrontaVersioni(a, b) {
  const pa = String(a || '0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

/** GET HTTPS con redirect, timeout e risposta come testo. */
function scaricaTesto(url, intestazioni = {}, redirect = 0) {
  return new Promise((risolvi, rifiuta) => {
    if (redirect > 5) return rifiuta(new Error('Troppi reindirizzamenti.'))
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'CACCA-updater', Accept: 'application/vnd.github+json', ...intestazioni } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return risolvi(scaricaTesto(res.headers.location, intestazioni, redirect + 1))
        }
        if (res.statusCode !== 200) {
          res.resume()
          return rifiuta(new Error(`Risposta ${res.statusCode} da GitHub.`))
        }
        let dati = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (dati += c))
        res.on('end', () => risolvi(dati))
      },
    )
    req.setTimeout(TIMEOUT_RETE, () => req.destroy(new Error('Tempo scaduto nel contattare GitHub.')))
    req.on('error', rifiuta)
  })
}

/** Scarica un file su disco calcolando l'impronta SHA-256 e riportando l'avanzamento. */
function scaricaFile(url, destinazione, onProgresso, redirect = 0) {
  return new Promise((risolvi, rifiuta) => {
    if (redirect > 5) return rifiuta(new Error('Troppi reindirizzamenti.'))
    const req = https.get(url, { headers: { 'User-Agent': 'CACCA-updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return risolvi(scaricaFile(res.headers.location, destinazione, onProgresso, redirect + 1))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return rifiuta(new Error(`Download non riuscito (risposta ${res.statusCode}).`))
      }
      const totale = parseInt(res.headers['content-length'] || '0', 10)
      let ricevuti = 0
      const hash = crypto.createHash('sha256')
      const out = fs.createWriteStream(destinazione)
      res.on('data', (pezzo) => {
        ricevuti += pezzo.length
        hash.update(pezzo)
        if (onProgresso && totale) onProgresso(Math.min(99, Math.round((ricevuti / totale) * 100)))
      })
      res.pipe(out)
      out.on('finish', () => out.close(() => risolvi({ sha256: hash.digest('hex'), byte: ricevuti })))
      out.on('error', rifiuta)
      res.on('error', rifiuta)
    })
    req.setTimeout(TIMEOUT_RETE, () => req.destroy(new Error('Tempo scaduto durante il download.')))
    req.on('error', rifiuta)
  })
}

// ---------------------------------------------------------------- stato app

/** Percorso dell'eseguibile portable da sostituire (null se non siamo in portable). */
function eseguibilePortable() {
  return process.env.PORTABLE_EXECUTABLE_FILE || null
}

/** L'aggiornamento automatico esiste solo nella versione portable (l'unica distribuita). */
function aggiornamentoSupportato() {
  return Boolean(eseguibilePortable())
}

// ---------------------------------------------------------------- controllo

/**
 * Chiede a GitHub l'ultima versione pubblicata.
 * Ritorna { versione, note, urlExe, sha256, byte } oppure null se non c'è nulla di nuovo.
 */
async function cercaAggiornamento(versioneCorrente) {
  // GitHub tiene in cache le risposte per circa un minuto: senza questi
  // accorgimenti una versione appena pubblicata risulterebbe ancora assente.
  const testo = await scaricaTesto(`https://api.github.com/repos/${REPO}/releases/latest?_=${Date.now()}`, {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  })
  const release = JSON.parse(testo)
  const versione = String(release.tag_name || '').replace(/^v/i, '')
  if (!versione) throw new Error('La release non indica una versione.')
  if (confrontaVersioni(versione, versioneCorrente) <= 0) return null

  const assets = Array.isArray(release.assets) ? release.assets : []
  const exe = assets.find((a) => a.name === NOME_ASSET)
  const manifesto = assets.find((a) => a.name === NOME_MANIFESTO)
  if (!exe) throw new Error(`La release ${versione} non contiene ${NOME_ASSET}.`)
  if (!manifesto) throw new Error(`La release ${versione} non contiene ${NOME_MANIFESTO} (impronta di sicurezza).`)

  const datiManifesto = JSON.parse(await scaricaTesto(manifesto.browser_download_url, { Accept: '*/*' }))
  const sha256 = String(datiManifesto.sha256 || '').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Impronta di sicurezza assente o non valida.')

  return {
    versione,
    note: String(release.body || '').trim(),
    urlExe: exe.browser_download_url,
    byte: exe.size || 0,
    sha256,
  }
}

// ---------------------------------------------------------------- installazione

function cartellaAppoggio() {
  const base = eseguibilePortable()
    ? path.dirname(eseguibilePortable())
    : path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CACCA')
  const dir = path.join(base, 'aggiornamento')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Scarica e verifica il nuovo eseguibile. Ritorna il percorso del file scaricato.
 * Non modifica nulla dell'installazione esistente.
 */
async function scaricaAggiornamento(info, onProgresso) {
  if (!aggiornamentoSupportato()) throw new Error('Aggiornamento automatico non disponibile in questa modalità.')
  const dir = cartellaAppoggio()
  const destinazione = path.join(dir, `CACCA-${info.versione}.exe`)
  try {
    fs.unlinkSync(destinazione)
  } catch {
    /* non esiste: ok */
  }
  const esito = await scaricaFile(info.urlExe, destinazione, onProgresso)
  if (esito.sha256.toLowerCase() !== info.sha256.toLowerCase()) {
    try {
      fs.unlinkSync(destinazione)
    } catch {
      /* ignora */
    }
    throw new Error('File scaricato non integro (impronta diversa): aggiornamento annullato.')
  }
  if (info.byte && esito.byte !== info.byte) {
    try {
      fs.unlinkSync(destinazione)
    } catch {
      /* ignora */
    }
    throw new Error('File scaricato incompleto: aggiornamento annullato.')
  }
  return destinazione
}

/**
 * Sostituzione SENZA script esterni: Windows permette di RINOMINARE un
 * eseguibile anche mentre è in esecuzione. Si mette da parte il vecchio file,
 * si porta il nuovo al suo posto e si riavvia il programma.
 * Se qualcosa non riesce, il vecchio eseguibile torna al suo posto.
 */
function sostituisciSenzaScript(fileNuovo) {
  const bersaglio = eseguibilePortable()
  if (!bersaglio) throw new Error('Aggiornamento disponibile solo nella versione portable.')
  const messoDaParte = `${bersaglio}.precedente`

  try {
    fs.unlinkSync(messoDaParte)
  } catch {
    /* non c'era: va bene */
  }

  fs.renameSync(bersaglio, messoDaParte) // consentito anche con l'app aperta
  try {
    fs.renameSync(fileNuovo, bersaglio)
  } catch (e) {
    fs.renameSync(messoDaParte, bersaglio) // ripristino: si resta alla versione attuale
    throw e
  }
  return messoDaParte
}

/** Rimuove il vecchio eseguibile lasciato dall'aggiornamento precedente. */
function ripulisciVecchioEseguibile() {
  const bersaglio = eseguibilePortable()
  if (!bersaglio) return
  try {
    fs.unlinkSync(`${bersaglio}.precedente`)
  } catch {
    /* non c'è o è ancora bloccato: si riproverà al prossimo avvio */
  }
}

/**
 * Script di riserva (host di sistema "wscript", nessuna finestra): attende la
 * chiusura dell'app, conserva una copia del vecchio eseguibile e la ripristina
 * se la sostituzione non riesce.
 */
function creaScriptInvisibile(fileNuovo) {
  const bersaglio = eseguibilePortable()
  const dir = cartellaAppoggio()
  const script = path.join(dir, 'sostituisci.vbs')
  const backup = `${bersaglio}.precedente`
  const registro = path.join(dir, 'registro-sostituzione.txt')
  const vbs = (s) => String(s).replace(/"/g, '""')

  const contenuto = `Option Explicit
Dim fso, sh, bersaglio, nuovo, backup, registro, tentativi, fatto
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
bersaglio = "${vbs(bersaglio)}"
nuovo = "${vbs(fileNuovo)}"
backup = "${vbs(backup)}"
registro = "${vbs(registro)}"

Sub Nota(testo)
  Dim f
  On Error Resume Next
  Set f = fso.OpenTextFile(registro, 8, True)
  f.WriteLine Now & "  " & testo
  f.Close
  On Error Goto 0
End Sub

Nota "sostituzione avviata"

WScript.Sleep 1500
fatto = False
tentativi = 0
Do While Not fatto And tentativi < 60
  On Error Resume Next
  If fso.FileExists(backup) Then fso.DeleteFile backup, True
  Err.Clear
  fso.MoveFile bersaglio, backup
  If Err.Number = 0 Then
    fatto = True
  ElseIf tentativi = 0 Or tentativi = 10 Or tentativi = 30 Then
    Nota "in attesa che il programma si chiuda (tentativo " & (tentativi + 1) & ")"
  End If
  On Error Goto 0
  If Not fatto Then
    WScript.Sleep 1000
    tentativi = tentativi + 1
  End If
Loop

If fatto Then
  On Error Resume Next
  fso.MoveFile nuovo, bersaglio
  If Err.Number <> 0 Or Not fso.FileExists(bersaglio) Then
    Nota "copia nuova non riuscita: ripristino la precedente"
    fso.MoveFile backup, bersaglio
  Else
    Nota "sostituzione completata"
  End If
  On Error Goto 0
Else
  Nota "RINUNCIA: impossibile sostituire, riavvio la versione attuale"
End If

sh.Run """" & bersaglio & """", 1, False
WScript.Sleep 3000
On Error Resume Next
If fso.FileExists(backup) Then fso.DeleteFile backup, True
fso.DeleteFile WScript.ScriptFullName, True
`
  fs.writeFileSync(script, contenuto, 'utf8')
  return script
}

/** Avvia lo script di sostituzione (l'app deve chiudersi subito dopo). */
function avviaSostituzione(fileNuovo) {
  const script = creaScriptInvisibile(fileNuovo)
  const p = spawn('wscript.exe', ['//B', '//Nologo', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: os.tmpdir(),
  })
  p.unref()
}

module.exports = {
  REPO,
  confrontaVersioni,
  aggiornamentoSupportato,
  eseguibilePortable,
  cercaAggiornamento,
  scaricaAggiornamento,
  sostituisciSenzaScript,
  ripulisciVecchioEseguibile,
  avviaSostituzione,
  cartellaAppoggio,
}
