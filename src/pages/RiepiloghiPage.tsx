import { useEffect, useMemo, useState } from 'react'
import { dbLocale, TIPI_TURNO } from '../lib/db'
import type { MeseTurni, Postazione } from '../lib/db'
import { useToast } from '../hooks/useToast'
import { giorniNelMese, meseIt, meseOggi, mesePiu } from '../lib/formato'

/** Anteprima fedele del modello dell'ufficio + generazione del file excel. */
export default function RiepiloghiPage() {
  const toast = useToast()
  const [mese, setMese] = useState(meseOggi())
  const [postazioni, setPostazioni] = useState<Postazione[]>([])
  const [dati, setDati] = useState<Record<string, MeseTurni>>({})
  const [genero, setGenero] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    async function carica() {
      const { data: elenco } = await dbLocale.postazioni.list()
      const attive = (elenco ?? []).filter((p) => p.attiva)
      if (!vivo) return
      setPostazioni(attive)
      const nuovo: Record<string, MeseTurni> = {}
      for (const p of attive) {
        const { data } = await dbLocale.turni.mese(p.id, mese)
        nuovo[p.id] = data ?? { turni: [], reperibilita: [] }
      }
      if (vivo) setDati(nuovo)
    }
    void carica()
    return () => {
      vivo = false
    }
  }, [mese])

  async function genera(p: Postazione) {
    setGenero(p.id)
    const { data, error } = await dbLocale.excel.genera(p.id, mese)
    setGenero(null)
    if (error) {
      toast.errore(error.message)
      return
    }
    if (data) {
      toast.ok(`File creato: ${data.percorso} (${data.totaleOre} ore, ${data.totaleRep} reperibilità). Pronto da mandare all'ufficio.`)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-cielo-800">Riepiloghi Excel</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMese(mesePiu(mese, -1))}
            className="rounded-lg border border-cielo-300 px-3 py-1.5 text-cielo-700 transition hover:bg-cielo-50"
          >
            ‹
          </button>
          <span className="min-w-40 text-center text-lg font-semibold text-cielo-800">{meseIt(mese)}</span>
          <button
            onClick={() => setMese(mesePiu(mese, 1))}
            className="rounded-lg border border-cielo-300 px-3 py-1.5 text-cielo-700 transition hover:bg-cielo-50"
          >
            ›
          </button>
        </div>
      </div>

      <p className="text-sm text-cielo-600">
        L'anteprima riproduce il modello che l'ufficio conosce (colonne B–H, X sui giorni, totali). Il
        pulsante crea il file .xlsx identico, pronto da allegare alla mail.
      </p>

      {postazioni.map((p) => (
        <Anteprima
          key={p.id}
          postazione={p}
          mese={mese}
          dati={dati[p.id] ?? { turni: [], reperibilita: [] }}
          inCorso={genero === p.id}
          onGenera={() => void genera(p)}
        />
      ))}
    </div>
  )
}

function Anteprima({
  postazione,
  mese,
  dati,
  inCorso,
  onGenera,
}: {
  postazione: Postazione
  mese: string
  dati: MeseTurni
  inCorso: boolean
  onGenera: () => void
}) {
  const giorni = giorniNelMese(mese)
  const perData = useMemo(() => {
    const t = new Map<string, typeof dati.turni>()
    for (const turno of dati.turni) {
      const elenco = t.get(turno.data) ?? []
      elenco.push(turno)
      t.set(turno.data, elenco)
    }
    const r = new Map(dati.reperibilita.map((x) => [x.data, x]))
    return { t, r }
  }, [dati])

  const totOre = dati.turni.reduce((acc, t) => acc + (TIPI_TURNO.find((x) => x.codice === t.tipo)?.ore ?? 0), 0)
  const totRep = dati.reperibilita.reduce((acc, r) => acc + r.quantita, 0)

  return (
    <section className="rounded-2xl border border-cielo-200 bg-panna p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-cielo-800">
            RIEPILOGO ORE C.A. POSTAZIONE DI {postazione.nome_excel}
          </h2>
          <p className="text-sm text-cielo-600">
            {meseIt(mese)} — {totOre} ore di servizio, {totRep} reperibilità
          </p>
        </div>
        <button
          onClick={onGenera}
          disabled={inCorso || totOre + totRep === 0}
          title={totOre + totRep === 0 ? 'Nessun turno segnato in questo mese' : 'Crea il file .xlsx da mandare'}
          className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
        >
          {inCorso ? 'Creazione…' : '⬇ Genera file excel'}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-left align-top text-[10px] uppercase leading-tight text-cielo-600">
              <th className="border border-cielo-200 bg-cielo-50 px-1.5 py-1">Giorno</th>
              {TIPI_TURNO.map((t) => (
                <th key={t.codice} className="border border-cielo-200 bg-cielo-50 px-1.5 py-1">
                  {t.nome}
                </th>
              ))}
              <th className="border border-cielo-200 bg-cielo-50 px-1.5 py-1">Superfestivo</th>
              <th className="border border-cielo-200 bg-cielo-50 px-1.5 py-1">Reperibilità</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: giorni }, (_, i) => i + 1).map((g) => {
              const iso = `${mese}-${String(g).padStart(2, '0')}`
              const turniGiorno = perData.t.get(iso) ?? []
              const rep = perData.r.get(iso)
              if (!turniGiorno.length && !rep) {
                return (
                  <tr key={iso} className="text-cielo-700">
                    <td className="border border-cielo-100 px-1.5 py-0.5">{g}</td>
                    {TIPI_TURNO.map((t) => (
                      <td key={t.codice} className="border border-cielo-100 px-1.5 py-0.5" />
                    ))}
                    <td className="border border-cielo-100 px-1.5 py-0.5" />
                    <td className="border border-cielo-100 px-1.5 py-0.5" />
                  </tr>
                )
              }
              return (
                <tr key={iso} className="bg-white font-medium text-cielo-800">
                  <td className="border border-cielo-200 px-1.5 py-0.5">{g}</td>
                  {TIPI_TURNO.map((t) => (
                    <td key={t.codice} className="border border-cielo-200 px-1.5 py-0.5 text-center">
                      {turniGiorno.some((x) => x.tipo === t.codice) ? 'X' : ''}
                    </td>
                  ))}
                  <td className="border border-cielo-200 px-1.5 py-0.5 text-center">
                    {turniGiorno.some((x) => x.superfestivo_ore > 0) ? 'X' : ''}
                  </td>
                  <td className="border border-cielo-200 px-1.5 py-0.5 text-center">
                    {rep ? (rep.quantita > 1 ? '2X' : 'X') : ''}
                  </td>
                </tr>
              )
            })}
            <tr className="font-bold text-cielo-800">
              <td colSpan={6} className="px-1.5 pt-2 text-right">
                TOTALE ORE DI SERVIZIO:
              </td>
              <td className="px-1.5 pt-2 text-center">{totOre}</td>
              <td />
            </tr>
            <tr className="font-bold text-cielo-800">
              <td colSpan={6} className="px-1.5 text-right">
                TOTALE REPERIBILITÀ:
              </td>
              <td className="px-1.5 text-center">{totRep}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
