// Chiude CACCA.exe prima di rigenerare il pacchetto.
// Se l'app è in esecuzione, electron-builder fallisce con "EBUSY: resource busy or locked".
// Prima si tenta una chiusura pulita, poi (solo se serve) una forzata.

import { execSync } from 'node:child_process'

const NOME = 'CACCA.exe'

function inEsecuzione() {
  try {
    const out = execSync(`tasklist /FI "IMAGENAME eq ${NOME}" /NH`, { encoding: 'utf8' })
    return out.includes(NOME)
  } catch {
    return false
  }
}

function chiudi(forzato) {
  try {
    execSync(`taskkill ${forzato ? '/F ' : ''}/IM ${NOME}`, { stdio: 'ignore' })
  } catch {
    /* già chiusa */
  }
}

function attendi(ms) {
  // attesa sincrona senza consumare CPU
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

if (!inEsecuzione()) {
  console.log(`${NOME} non è in esecuzione: procedo.`)
} else {
  console.log(`${NOME} è aperta: la chiudo per liberare i file…`)
  chiudi(false)
  attendi(4000) // tempo per una chiusura ordinata (il database viene chiuso correttamente)
  if (inEsecuzione()) {
    console.log('Chiusura pulita non riuscita: chiusura forzata.')
    chiudi(true)
    attendi(1000)
  }
  console.log(inEsecuzione() ? '⚠️ ATTENZIONE: risulta ancora aperta.' : 'Chiusa: procedo.')
}
