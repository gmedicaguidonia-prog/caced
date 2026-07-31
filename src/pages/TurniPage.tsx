import { useCallback, useEffect, useMemo, useState } from 'react'
import { dbLocale, TIPI_TURNO } from '../lib/db'
import type { MeseTurni, Postazione, TipoTurnoCodice, Turno } from '../lib/db'
import { useToast } from '../hooks/useToast'
import { GIORNI_BREVI, giorniNelMese, giornoSettimana, meseIt, meseOggi, mesePiu } from '../lib/formato'

const COLORE_TIPO: Record<TipoTurnoCodice, string> = {
  nott12: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  pref_g10: 'bg-amber-100 text-amber-800 border-amber-300',
  pref22: 'bg-orange-100 text-orange-800 border-orange-300',
  fest12: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  fest24: 'bg-teal-100 text-teal-800 border-teal-300',
}

type Selezione = { postazione: Postazione; data: string }

export default function TurniPage() {
  const toast = useToast()
  const [mese, setMese] = useState(meseOggi())
  const [postazioni, setPostazioni] = useState<Postazione[]>([])
  const [dati, setDati] = useState<Record<string, MeseTurni>>({})
  const [selezione, setSelezione] = useState<Selezione | null>(null)

  const carica = useCallback(async () => {
    const { data: elenco } = await dbLocale.postazioni.list()
    const attive = (elenco ?? []).filter((p) => p.attiva)
    setPostazioni(attive)
    const nuovo: Record<string, MeseTurni> = {}
    for (const p of attive) {
      const { data } = await dbLocale.turni.mese(p.id, mese)
      nuovo[p.id] = data ?? { turni: [], reperibilita: [] }
    }
    setDati(nuovo)
  }, [mese])

  useEffect(() => {
    void carica()
  }, [carica])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-cielo-800">Registro Turni</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMese(mesePiu(mese, -1))}
            className="rounded-lg border border-cielo-300 px-3 py-1.5 text-cielo-700 transition hover:bg-cielo-50"
            title="Mese precedente"
          >
            ‹
          </button>
          <span className="min-w-40 text-center text-lg font-semibold text-cielo-800">{meseIt(mese)}</span>
          <button
            onClick={() => setMese(mesePiu(mese, 1))}
            className="rounded-lg border border-cielo-300 px-3 py-1.5 text-cielo-700 transition hover:bg-cielo-50"
            title="Mese successivo"
          >
            ›
          </button>
          <button
            onClick={() => setMese(meseOggi())}
            className="ml-1 rounded-lg border border-cielo-300 px-3 py-1.5 text-sm text-cielo-700 transition hover:bg-cielo-50"
          >
            Oggi
          </button>
        </div>
      </div>

      <p className="text-sm text-cielo-600">
        Clicca su un giorno per segnare turni e reperibilità (un giorno può avere anche più turni, come il
        31 dicembre). Le ore «superfestive» vengono proposte in automatico secondo l'elenco AIR.
      </p>

      {postazioni.map((p) => (
        <Calendario
          key={p.id}
          postazione={p}
          mese={mese}
          dati={dati[p.id] ?? { turni: [], reperibilita: [] }}
          onGiorno={(data) => setSelezione({ postazione: p, data })}
        />
      ))}

      {selezione && (
        <ModaleGiorno
          selezione={selezione}
          dati={dati[selezione.postazione.id] ?? { turni: [], reperibilita: [] }}
          onChiudi={() => setSelezione(null)}
          onSalvato={async () => {
            setSelezione(null)
            await carica()
            toast.ok('Giorno aggiornato.')
          }}
        />
      )}
    </div>
  )
}

function Calendario({
  postazione,
  mese,
  dati,
  onGiorno,
}: {
  postazione: Postazione
  mese: string
  dati: MeseTurni
  onGiorno: (data: string) => void
}) {
  const giorni = giorniNelMese(mese)
  const primo = giornoSettimana(`${mese}-01`)
  const perData = useMemo(() => {
    const t = new Map<string, Turno[]>()
    for (const turno of dati.turni) {
      const elenco = t.get(turno.data) ?? []
      elenco.push(turno)
      t.set(turno.data, elenco)
    }
    const r = new Map(dati.reperibilita.map((x) => [x.data, x]))
    return { turni: t, rep: r }
  }, [dati])

  const ore = dati.turni.reduce((acc, t) => acc + (TIPI_TURNO.find((x) => x.codice === t.tipo)?.ore ?? 0), 0)
  const sf = dati.turni.reduce((acc, t) => acc + (t.superfestivo_ore || 0), 0)
  const rep = dati.reperibilita.reduce((acc, r) => acc + r.quantita, 0)

  const celle: (number | null)[] = [
    ...Array.from({ length: primo }, () => null),
    ...Array.from({ length: giorni }, (_, i) => i + 1),
  ]

  return (
    <section className="rounded-2xl border border-cielo-200 bg-panna p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-cielo-800">{postazione.nome}</h2>
        <p className="text-sm text-cielo-600">
          <b>{ore} ore</b> · {rep} reperibilità{sf > 0 && <> · ★ {sf}h superfestive</>}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {GIORNI_BREVI.map((g) => (
          <div key={g} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-cielo-500">
            {g}
          </div>
        ))}
        {celle.map((g, i) => {
          if (g === null) return <div key={`v${i}`} />
          const iso = `${mese}-${String(g).padStart(2, '0')}`
          const turniGiorno = perData.turni.get(iso) ?? []
          const r = perData.rep.get(iso)
          const domenica = giornoSettimana(iso) === 6
          return (
            <button
              key={iso}
              onClick={() => onGiorno(iso)}
              className={`flex min-h-16 flex-col items-stretch gap-1 rounded-lg border p-1.5 text-left transition hover:ring-2 hover:ring-cielo-300 ${
                turniGiorno.length || r ? 'border-cielo-300 bg-white' : 'border-cielo-200 bg-cielo-50/60'
              }`}
            >
              <span className={`text-xs font-semibold ${domenica ? 'text-red-500' : 'text-cielo-500'}`}>{g}</span>
              {turniGiorno.map((turno) => {
                const tipo = TIPI_TURNO.find((x) => x.codice === turno.tipo)
                if (!tipo) return null
                return (
                  <span
                    key={turno.tipo}
                    className={`truncate rounded border px-1 py-0.5 text-[10px] font-medium leading-tight ${COLORE_TIPO[turno.tipo]}`}
                    title={tipo.nome}
                  >
                    {tipo.breve}
                    {turno.superfestivo_ore > 0 && ' ★'}
                  </span>
                )
              })}
              {r && (
                <span className="truncate rounded border border-sky-300 bg-sky-100 px-1 py-0.5 text-[10px] font-medium leading-tight text-sky-800">
                  Reperibile{r.quantita > 1 ? ' ×2' : ''}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ModaleGiorno({
  selezione,
  dati,
  onChiudi,
  onSalvato,
}: {
  selezione: Selezione
  dati: MeseTurni
  onChiudi: () => void
  onSalvato: () => void
}) {
  const toast = useToast()
  const esistenti = dati.turni.filter((t) => t.data === selezione.data)
  const repEsistente = dati.reperibilita.find((r) => r.data === selezione.data) ?? null

  // tipo → ore superfestive (presente nella mappa = turno selezionato)
  const [scelti, setScelti] = useState<Partial<Record<TipoTurnoCodice, number>>>(() =>
    Object.fromEntries(esistenti.map((t) => [t.tipo, t.superfestivo_ore])),
  )
  const [rep, setRep] = useState(repEsistente?.quantita ?? 0)
  const [attesa, setAttesa] = useState(false)

  async function commuta(tipo: TipoTurnoCodice) {
    setScelti((s) => {
      if (tipo in s) {
        const { [tipo]: _via, ...resto } = s
        return resto
      }
      return { ...s, [tipo]: 0 }
    })
    // proposta automatica delle ore superfestive per il tipo appena acceso
    if (!(tipo in scelti)) {
      const { data } = await dbLocale.turni.propostaSuperfestivo(selezione.data, tipo)
      if (data !== null && data !== undefined) {
        setScelti((s) => (tipo in s ? { ...s, [tipo]: data } : s))
      }
    }
  }

  const [g, m, a] = selezione.data.split('-').reverse()

  async function salva() {
    setAttesa(true)
    const r1 = await dbLocale.turni.imposta({
      data: selezione.data,
      postazioneId: selezione.postazione.id,
      tipi: Object.entries(scelti).map(([tipo, sf]) => ({
        tipo: tipo as TipoTurnoCodice,
        superfestivoOre: sf,
      })),
    })
    const r2 = await dbLocale.turni.repImposta({
      data: selezione.data,
      postazioneId: selezione.postazione.id,
      quantita: rep,
    })
    setAttesa(false)
    if (r1.error || r2.error) {
      toast.errore(r1.error?.message ?? r2.error?.message ?? 'Salvataggio non riuscito.')
      return
    }
    onSalvato()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4" onClick={onChiudi}>
      <div
        className="w-full max-w-md rounded-2xl border border-cielo-200 bg-panna p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-cielo-800">
          {g}/{m}/{a} — {selezione.postazione.nome}
        </h3>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-cielo-500">
          Turni del giorno (anche più di uno)
        </p>
        <div className="mt-2 grid gap-1.5">
          {TIPI_TURNO.map((t) => {
            const attivo = t.codice in scelti
            return (
              <div
                key={t.codice}
                className={`rounded-lg border px-3 py-2 ${attivo ? 'border-cielo-400 bg-white' : 'border-cielo-200 bg-white'}`}
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm text-cielo-800">
                  <input type="checkbox" checked={attivo} onChange={() => void commuta(t.codice)} />
                  <span className="flex-1">{t.nome}</span>
                  <span className="text-xs text-cielo-500">col. {t.colonna}</span>
                </label>
                {attivo && (
                  <label className="mt-1.5 flex items-center gap-2 pl-6 text-xs text-cielo-700">
                    ★ ore superfestive (+15 €/h):
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={scelti[t.codice] ?? 0}
                      onChange={(e) =>
                        setScelti((s) => ({
                          ...s,
                          [t.codice]: Math.max(0, Math.min(24, Number(e.target.value) || 0)),
                        }))
                      }
                      className="w-16 rounded-lg border border-cielo-300 bg-white px-2 py-0.5 text-xs"
                    />
                  </label>
                )}
              </div>
            )
          })}
        </div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-cielo-500">Reperibilità</p>
        <div className="mt-2 flex gap-1.5">
          {[0, 1, 2].map((q) => (
            <button
              key={q}
              onClick={() => setRep(q)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                rep === q
                  ? 'border-cielo-500 bg-cielo-500 text-white'
                  : 'border-cielo-300 bg-white text-cielo-700 hover:bg-cielo-50'
              }`}
            >
              {q === 0 ? 'No' : q === 1 ? '1 turno' : '2 (giorno+notte)'}
            </button>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onChiudi}
            className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
          >
            Annulla
          </button>
          <button
            onClick={() => void salva()}
            disabled={attesa}
            className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
          >
            {attesa ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}
