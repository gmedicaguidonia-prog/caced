// Google Drive dell'utente: i PDF dei cedolini vivono nella cartella
// "DATI CACCA" del SUO Drive (creata se manca). Si usa l'ambito drive.file:
// l'app vede e tocca SOLO i file che ha creato lei, nient'altro del Drive.

import { GOOGLE_CLIENT_ID } from './supabase'

const AMBITO = 'https://www.googleapis.com/auth/drive.file'
const NOME_CARTELLA = 'DATI CACCA'
const LS_TOKEN = 'cacca_drive_token'

type TokenClient = { requestAccessToken: (opts?: { prompt?: string }) => void }

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string
            scope: string
            callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void
            error_callback?: (e: { type?: string; message?: string }) => void
          }): TokenClient
        }
      }
    }
  }
}

let scriptCaricato: Promise<void> | null = null

function caricaScriptGoogle(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!scriptCaricato) {
    scriptCaricato = new Promise((risolvi, rifiuta) => {
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.onload = () => risolvi()
      s.onerror = () => rifiuta(new Error('Non riesco a caricare i servizi Google.'))
      document.head.appendChild(s)
    })
  }
  return scriptCaricato
}

function tokenSalvato(): string | null {
  try {
    const raw = sessionStorage.getItem(LS_TOKEN)
    if (!raw) return null
    const { token, scade } = JSON.parse(raw)
    if (Date.now() > scade - 60_000) return null
    return token
  } catch {
    return null
  }
}

/** Chiede (o riusa) il permesso di scrivere i file dell'app sul Drive. */
export async function tokenDrive(): Promise<string> {
  const salvato = tokenSalvato()
  if (salvato) return salvato
  await caricaScriptGoogle()
  return new Promise((risolvi, rifiuta) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: AMBITO,
      callback: (r) => {
        if (r.error || !r.access_token) {
          rifiuta(new Error('Permesso per Google Drive non concesso.'))
          return
        }
        try {
          sessionStorage.setItem(
            LS_TOKEN,
            JSON.stringify({ token: r.access_token, scade: Date.now() + (r.expires_in ?? 3600) * 1000 }),
          )
        } catch {
          /* senza memoria di sessione si richiederà */
        }
        risolvi(r.access_token)
      },
      // senza questo, popup chiuso o bloccato = attesa infinita
      error_callback: (e) => {
        rifiuta(
          new Error(
            e?.type === 'popup_failed_to_open'
              ? 'Il browser ha bloccato la finestra di Google: consenti i popup e riprova.'
              : 'Permesso per Google Drive non concesso (finestra chiusa).',
          ),
        )
      },
    })
    client.requestAccessToken()
  })
}

async function driveApi(percorso: string, opzioni: RequestInit = {}): Promise<Response> {
  const token = await tokenDrive()
  const r = await fetch(`https://www.googleapis.com/${percorso}`, {
    ...opzioni,
    headers: { Authorization: `Bearer ${token}`, ...(opzioni.headers || {}) },
  })
  if (!r.ok) {
    const testo = await r.text()
    throw new Error(`Google Drive: errore ${r.status} — ${testo.slice(0, 160)}`)
  }
  return r
}

/** Trova (o crea) la cartella "DATI CACCA" e ne restituisce l'id. */
export async function cartellaDatiCacca(): Promise<string> {
  const q = encodeURIComponent(
    `name='${NOME_CARTELLA}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )
  const r = await driveApi(`drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`)
  const { files } = (await r.json()) as { files: { id: string }[] }
  if (files.length) return files[0].id
  const crea = await driveApi('drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NOME_CARTELLA, mimeType: 'application/vnd.google-apps.folder' }),
  })
  const { id } = (await crea.json()) as { id: string }
  return id
}

/** Carica un PDF nella cartella DATI CACCA. Ritorna l'id del file su Drive. */
export async function caricaSuDrive(file: File | Blob, nome: string): Promise<string> {
  const cartella = await cartellaDatiCacca()
  const metadati = { name: nome, parents: [cartella] }
  const confine = 'cacca' + Math.random().toString(36).slice(2)
  const corpo = new Blob(
    [
      `--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadati)}\r\n`,
      `--${confine}\r\nContent-Type: application/pdf\r\n\r\n`,
      file,
      `\r\n--${confine}--`,
    ],
    { type: `multipart/related; boundary=${confine}` },
  )
  const r = await driveApi('upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${confine}` },
    body: corpo,
  })
  const { id } = (await r.json()) as { id: string }
  return id
}

/** Indirizzo per aprire un file di Drive in un'altra scheda. */
export function linkDrive(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

/** Stesso file, ma nella versione che si può mostrare dentro l'app. */
export function anteprimaDrive(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`
}

export function linkCartellaDrive(cartellaId: string): string {
  return `https://drive.google.com/drive/folders/${cartellaId}`
}
