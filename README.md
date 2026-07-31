# 💩 CACCA — Calcolo Automatico Cedolini Continuità Assistenziale

App **web** per i medici di continuità assistenziale: registro turni,
riepiloghi ore per l'ufficio (excel e PDF), previsione dei compensi
(ACN + A.I.R. Lazio), archivio cedolini NoiPA con **controllo automatico
voce per voce**. Funziona su computer, iPad e telefono.

**App:** https://marabellis-prog.github.io/caced/

## Architettura

- **Interfaccia**: React + Vite + Tailwind, pubblicata su GitHub Pages.
- **Accesso**: login Google (Supabase Auth); entra solo chi è nella lista
  degli autorizzati.
- **Dati**: Supabase (tabelle con prefisso `cacca_`, regole RLS per email:
  ognuno vede solo le proprie righe).
- **Cedolini PDF**: cartella **DATI CACCA** sul Google Drive dell'utente
  (ambito `drive.file`: l'app vede solo i file creati da lei).
- **Motore di calcolo** (`src/lib/motore.cjs`): tipi di turno, superfestivi
  AIR (Pasqua calcolata), tariffe con decorrenza, arrotondamenti NoiPA,
  lettura del testo dei cedolini, riconciliazione con riconoscimento dei
  pagamenti in ritardo ("Rif MM/AA").

## Sviluppo

```bash
npm install
npm run dev       # http://localhost:5174
npm run build
npm run collaudo  # motore contro i cedolini reali + lettura PDF con pdfjs (dati locali)
```

Il deploy avviene da solo a ogni push su `main` (GitHub Actions → Pages).
I dati personali (seed, analisi) restano fuori dal repository.
