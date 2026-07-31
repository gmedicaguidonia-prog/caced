// Riavvia CACCA al termine della rigenerazione del pacchetto.
// REGOLA FISSA del progetto (come TR.A.V.I.): ogni modifica che comporta la
// chiusura dell'app deve terminare con l'app riaperta sulla versione nuova.
// Se esiste l'installazione "di casa" (D:\CACCA) si riavvia quella; altrimenti
// la copia a cartella dentro release/.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const candidati = [
  'D:\\CACCA\\CACCA.exe',
  path.resolve('release', 'win-unpacked', 'CACCA.exe'),
]
const exe = candidati.find((p) => existsSync(p))

if (!exe) {
  console.log('CACCA.exe non trovato: riavvio saltato.')
} else {
  const p = spawn(exe, [], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) })
  p.unref()
  console.log(`CACCA riavviata: ${exe}`)
}
