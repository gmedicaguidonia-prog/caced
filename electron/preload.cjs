// Ponte sicuro tra la finestra (React) e il processo principale (database).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cacca', {
  auth: {
    stato: () => ipcRenderer.invoke('auth:stato'),
    setup: (r) => ipcRenderer.invoke('auth:setup', r),
    login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    cambiaPassword: (vecchia, nuova) => ipcRenderer.invoke('auth:cambia-password', { vecchia, nuova }),
  },
  utenti: {
    list: () => ipcRenderer.invoke('utenti:list'),
    insert: (r) => ipcRenderer.invoke('utenti:insert', r),
    update: (id, campi) => ipcRenderer.invoke('utenti:update', { id, campi }),
    resetPassword: (id, nuova) => ipcRenderer.invoke('utenti:reset-password', { id, nuova }),
    remove: (id) => ipcRenderer.invoke('utenti:delete', id),
  },
  preferenze: {
    tutte: () => ipcRenderer.invoke('pref:tutte'),
    imposta: (chiave, valore) => ipcRenderer.invoke('pref:imposta', { chiave, valore }),
  },
  postazioni: {
    list: () => ipcRenderer.invoke('postazioni:list'),
    salva: (r) => ipcRenderer.invoke('postazioni:salva', r),
    elimina: (id) => ipcRenderer.invoke('postazioni:elimina', id),
  },
  turni: {
    mese: (postazioneId, mese) => ipcRenderer.invoke('turni:mese', { postazioneId, mese }),
    imposta: (r) => ipcRenderer.invoke('turni:imposta', r),
    repImposta: (r) => ipcRenderer.invoke('turni:rep-imposta', r),
    propostaSuperfestivo: (data, tipo) => ipcRenderer.invoke('turni:superfestivo-auto', { data, tipo }),
  },
  calcoli: {
    mese: (mese) => ipcRenderer.invoke('calcoli:mese', mese),
    anno: (anno) => ipcRenderer.invoke('calcoli:anno', anno),
    mesiDisponibili: () => ipcRenderer.invoke('calcoli:mesi-disponibili'),
  },
  excel: {
    genera: (postazioneId, mese) => ipcRenderer.invoke('excel:genera', { postazioneId, mese }),
  },
  cedolini: {
    list: () => ipcRenderer.invoke('cedolini:list'),
    importa: () => ipcRenderer.invoke('cedolini:importa'),
    riconcilia: (id) => ipcRenderer.invoke('cedolini:riconcilia', id),
    collegaSede: (r) => ipcRenderer.invoke('cedolini:collega-sede', r),
    apri: (id) => ipcRenderer.invoke('cedolini:apri', id),
    elimina: (id) => ipcRenderer.invoke('cedolini:elimina', id),
  },
  benzina: {
    list: () => ipcRenderer.invoke('benzina:list'),
    imposta: (mese, prezzo) => ipcRenderer.invoke('benzina:imposta', { mese, prezzo }),
  },
  tariffe: {
    list: () => ipcRenderer.invoke('tariffe:list'),
    salva: (r) => ipcRenderer.invoke('tariffe:salva', r),
    elimina: (id) => ipcRenderer.invoke('tariffe:elimina', id),
  },
  incarichi: {
    list: () => ipcRenderer.invoke('incarichi:list'),
    salva: (r) => ipcRenderer.invoke('incarichi:salva', r),
    elimina: (id) => ipcRenderer.invoke('incarichi:elimina', id),
  },
  datiApp: {
    info: () => ipcRenderer.invoke('dati:info'),
    esporta: () => ipcRenderer.invoke('dati:esporta'),
    apriCartella: () => ipcRenderer.invoke('dati:apri-cartella'),
  },
  sistemazione: {
    stato: () => ipcRenderer.invoke('sistemazione:stato'),
    scegliCartella: () => ipcRenderer.invoke('sistemazione:scegli-cartella'),
    esegui: (scelte) => ipcRenderer.invoke('sistemazione:esegui', scelte),
    rifiuta: () => ipcRenderer.invoke('sistemazione:rifiuta'),
  },
  collegamenti: {
    stato: () => ipcRenderer.invoke('collegamenti:stato'),
    crea: (scelte) => ipcRenderer.invoke('collegamenti:crea', scelte),
    rimanda: () => ipcRenderer.invoke('collegamenti:rimanda'),
    mostraCartella: () => ipcRenderer.invoke('collegamenti:mostra-cartella'),
  },
  aggiornamenti: {
    stato: () => ipcRenderer.invoke('agg:stato'),
    controlla: () => ipcRenderer.invoke('agg:controlla'),
    installa: () => ipcRenderer.invoke('agg:installa'),
    // avvisa l'interfaccia a ogni cambio di stato (controllo, download, errore…)
    osserva: (callback) => {
      const gestore = (_ev, stato) => callback(stato)
      ipcRenderer.on('agg:stato', gestore)
      return () => ipcRenderer.removeListener('agg:stato', gestore)
    },
  },
  versione: () => ipcRenderer.invoke('app:versione'),
})
