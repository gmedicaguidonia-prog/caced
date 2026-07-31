# 💩 CACCA — Calcolo Automatico Cedolini Continuità Assistenziale

App desktop **completamente locale** (Windows) per i medici di continuità
assistenziale: registro turni, generazione dei riepiloghi ore in excel nel
formato dell'ufficio, previsione dei compensi (ACN + A.I.R. Lazio), archivio
dei cedolini NoiPA con **controllo automatico voce per voce**.

## Come funziona

- **Zero cloud**: database SQLite nella cartella `dati` accanto a `CACCA.exe`
  (consigliata l'installazione in `D:\CACCA`), copia di sicurezza automatica
  giornaliera in `dati/backup`.
- **Registro turni** a calendario per postazione, con la maggiorazione
  superfestiva proposta in automatico secondo l'elenco AIR.
- **Riepiloghi excel** identici al modello dell'ufficio (colonne B–H, X sui
  giorni, totali), un file per postazione/mese.
- **Previsione compensi**: onorario ACN, incremento A.I.R., reperibilità,
  superfestivo, chilometrico (ACN art. 72 c. 2: costo di 1 L di benzina verde
  per ora), ENPAM e ritenuta d'acconto con gli stessi arrotondamenti di NoiPA.
- **Cedolini**: importa il PDF NoiPA, l'app legge le voci, archivia il file e
  confronta ogni importo con le ore dichiarate (segnala reperibilità non
  pagate, superfestivi dimenticati, arretrati in ritardo…).
- **Aggiornamenti automatici** da GitHub Releases con verifica SHA-256.

## Sviluppo

```bash
npm install
npm run app      # build + avvio in Electron
npm run smoke    # collaudo automatico (motore verificato sui cedolini reali, se presente il seed)
npm run dist     # genera release/CACCA.exe (portable)
npm run rilascia # pubblica su GitHub Releases (serve GITHUB_TOKEN in .env.local)
```

Il repository contiene **solo codice**: i dati personali (turni, cedolini,
`electron/seed-dati.json`) restano fuori da git e fuori dal pacchetto
distribuito — lo script di rilascio lo verifica prima di pubblicare.
