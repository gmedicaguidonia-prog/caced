import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePreferenze, MENU_MIN, MENU_MAX } from '../hooks/usePreferenze'
import Icona from './Icone'
import type { NomeIcona } from './Icone'
import { useAggiornamenti } from './GestoreAggiornamenti'
import { TEMI } from '../lib/temi'
import { useMese } from '../hooks/useMese'
import { meseIt, mesePiu, meseOggi } from '../lib/formato'

const LOGO = './logo.svg'

const VOCI: { to: string; label: string; icona: NomeIcona }[] = [
  { to: '/', label: 'Home', icona: 'home' },
  { to: '/turni', label: 'Registro Turni', icona: 'turni' },
  { to: '/riepiloghi', label: 'Riepilogo turni', icona: 'excel' },
  { to: '/previsione', label: 'Previsione Compensi', icona: 'previsione' },
  { to: '/cedolini', label: 'Cedolini', icona: 'cedolini' },
  { to: '/tariffe', label: 'Tariffe e Impostazioni', icona: 'tariffe' },
]

export default function Layout() {
  const { utente, esci } = useAuth()
  const { tema, impostaTema, larghezzaMenu, impostaLarghezzaMenu } = usePreferenze()
  const { controlloManuale, controllaOra } = useAggiornamenti()
  const { mese, impostaMese, vaiOggi, puoAvanzare } = useMese()

  // larghezza del menu: si trascina il bordo destro
  const [larghezza, setLarghezza] = useState(larghezzaMenu)
  const trascinamento = useRef(false)

  useEffect(() => setLarghezza(larghezzaMenu), [larghezzaMenu])

  const muovi = useCallback((e: MouseEvent) => {
    if (!trascinamento.current) return
    setLarghezza(Math.min(MENU_MAX, Math.max(MENU_MIN, e.clientX)))
  }, [])

  const rilascia = useCallback(() => {
    if (!trascinamento.current) return
    trascinamento.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    setLarghezza((l) => {
      impostaLarghezzaMenu(l)
      return l
    })
  }, [impostaLarghezzaMenu])

  useEffect(() => {
    window.addEventListener('mousemove', muovi)
    window.addEventListener('mouseup', rilascia)
    return () => {
      window.removeEventListener('mousemove', muovi)
      window.removeEventListener('mouseup', rilascia)
    }
  }, [muovi, rilascia])

  function iniziaTrascinamento() {
    trascinamento.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-cielo-100">
      {/* HEADER */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-cielo-200 bg-panna px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="flex shrink-0 flex-col items-center gap-0.5" title="Vai alla home">
            <span className="flex items-center gap-2">
              <img src={LOGO} alt="CACCA" className="h-10 w-10" />
              <span className="text-lg font-bold tracking-tight text-cielo-800">CACCA</span>
            </span>
            <span className="block text-center text-[10px] uppercase leading-tight tracking-wide text-cielo-500">
              Calcolo Automatico Cedolini
              <br />
              Continuità Assistenziale
            </span>
          </Link>

          <NavLink
            to="/utenti"
            title="Gestione utenti"
            className={({ isActive }) =>
              `flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                isActive ? 'bg-cielo-200 text-cielo-800' : 'text-cielo-700 hover:bg-cielo-50'
              }`
            }
          >
            <Icona nome="utenti" />
            Utenti
          </NavLink>

          {/* mese di lavoro: vale per registro, riepiloghi e previsioni */}
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-cielo-200 bg-cielo-50 px-1 py-0.5">
            <button
              onClick={() => impostaMese(mesePiu(mese, -1))}
              title="Mese precedente"
              className="rounded px-2 py-1 text-cielo-700 transition hover:bg-cielo-100"
            >
              ‹
            </button>
            <span className="min-w-36 text-center text-sm font-semibold text-cielo-800">{meseIt(mese)}</span>
            <button
              onClick={() => impostaMese(mesePiu(mese, 1))}
              disabled={!puoAvanzare}
              title={puoAvanzare ? 'Mese successivo' : 'Oltre due mesi da oggi non si va'}
              className="rounded px-2 py-1 text-cielo-700 transition hover:bg-cielo-100 disabled:cursor-not-allowed disabled:text-cielo-300"
            >
              ›
            </button>
            {mese !== meseOggi() && (
              <button
                onClick={vaiOggi}
                title="Torna al mese corrente"
                className="ml-0.5 rounded border border-cielo-300 bg-panna px-2 py-1 text-xs font-medium text-cielo-700 transition hover:bg-cielo-100"
              >
                Oggi
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-sm">
          {/* quadratini per la scelta del tema */}
          <div className="flex items-center gap-1.5">
            {TEMI.map((t) => (
              <button
                key={t.id}
                onClick={() => impostaTema(t.id)}
                title={t.nome}
                aria-label={`Tema ${t.nome}`}
                className={`h-5 w-5 overflow-hidden rounded transition ${
                  tema === t.id
                    ? 'ring-2 ring-cielo-600 ring-offset-1 ring-offset-panna'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{ background: `linear-gradient(135deg, ${t.c1} 0 50%, ${t.c2} 50% 100%)` }}
              />
            ))}
          </div>

          {/* il numero di versione è cliccabile: verifica subito se c'è un aggiornamento */}
          <button
            onClick={() => void controllaOra()}
            disabled={controlloManuale === 'incorso'}
            title="Clicca per controllare se è disponibile un aggiornamento"
            className="rounded px-1.5 py-1 text-xs text-cielo-400 transition hover:bg-cielo-50 hover:text-cielo-600"
          >
            {controlloManuale === 'incorso'
              ? 'controllo…'
              : controlloManuale === 'aggiornato'
                ? 'già aggiornato ✓'
                : `v${__APP_VERSION__}`}
          </button>

          <span className="hidden text-cielo-700 md:inline">
            {[utente?.nome, utente?.cognome].filter(Boolean).join(' ') || utente?.email}
            {utente?.ruolo === 'admin' && <span className="ml-1 text-xs text-cielo-500">· admin</span>}
          </span>
          <button
            onClick={() => void esci()}
            className="rounded-lg border border-cielo-300 px-3 py-1.5 text-cielo-700 transition hover:bg-cielo-50"
          >
            Esci
          </button>
        </div>
      </header>

      {/* CORPO: menù + contenuto */}
      <div className="flex flex-1 overflow-hidden">
        <aside
          style={{ width: larghezza }}
          className="shrink-0 overflow-y-auto border-r border-cielo-200 bg-sidebar p-3"
        >
          <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-cielo-500">
            Gestione
          </p>
          {VOCI.map((v) => (
            <NavLink
              key={v.to}
              to={v.to}
              end={v.to === '/'}
              title={v.label}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-cielo-200 text-cielo-800' : 'text-cielo-700 hover:bg-cielo-50'
                }`
              }
            >
              <Icona nome={v.icona} />
              <span className="min-w-0 flex-1 truncate">{v.label}</span>
            </NavLink>
          ))}

          <p className="mt-6 rounded-lg bg-cielo-50 px-3 py-3 text-xs leading-relaxed text-cielo-600">
            I dati vivono nella cartella <b>dati</b> accanto a CACCA.exe, con una copia di sicurezza
            automatica ogni giorno.
          </p>
        </aside>

        {/* bordo trascinabile per allargare o stringere il menu */}
        <div
          onMouseDown={iniziaTrascinamento}
          onDoubleClick={() => impostaLarghezzaMenu(224)}
          title="Trascina per cambiare la larghezza del menu (doppio clic per la misura standard)"
          className="group w-1.5 shrink-0 cursor-col-resize bg-cielo-200 transition hover:bg-cielo-400"
        >
          <div className="mx-auto mt-[45vh] h-8 w-0.5 rounded bg-cielo-400 transition group-hover:bg-cielo-600" />
        </div>

        <main id="contenuto" className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
