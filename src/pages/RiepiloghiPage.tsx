import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { dbLocale, TIPI_TURNO } from '../lib/db'
import type { MeseTurni, Postazione } from '../lib/db'
import { useToast } from '../hooks/useToast'
import { useMese } from '../hooks/useMese'
import { giorniNelMese, meseIt } from '../lib/formato'

/** Anteprima fedele del modello dell'ufficio + generazione di excel e PDF. */
export default function RiepiloghiPage() {
  const toast = useToast()
  const { mese } = useMese()
  const [postazioni, setPostazioni] = useState<Postazione[]>([])
  const [dati, setDati] = useState<Record<string, MeseTurni>>({})
  const [genero, setGenero] = useState<string | null>(null)
  const [caricato, setCaricato] = useState(false)

  useEffect(() => {
    let vivo = true
    setCaricato(false)
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
      if (vivo) {
        setDati(nuovo)
        setCaricato(true)
      }
    }
    void carica()
    return () => {
      vivo = false
    }
  }, [mese])

  // niente foglio per le postazioni senza nulla da dichiarare in questo mese
  const conDati = postazioni.filter((p) => {
    const d = dati[p.id]
    return d && (d.turni.length > 0 || d.reperibilita.length > 0)
  })

  async function genera(p: Postazione, formato: 'xlsx' | 'pdf') {
    setGenero(`${p.id}|${formato}`)
    const { data, error } = await dbLocale.excel.genera(p.id, mese, formato)
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
      <h1 className="text-2xl font-bold tracking-tight text-cielo-800">Riepilogo turni — {meseIt(mese)}</h1>

      <p className="text-sm text-cielo-600">
        L'anteprima riproduce il modello che l'ufficio conosce (colonne B–H, X sui giorni, totali). I
        pulsanti creano il file da allegare alla mail, in Excel o in PDF.
      </p>

      {!caricato ? (
        <p className="rounded-2xl border border-cielo-200 bg-panna p-10 text-center text-sm text-cielo-500">
          Leggo i turni di {meseIt(mese)}…
        </p>
      ) : conDati.length === 0 ? (
        <div className="rounded-2xl border border-cielo-200 bg-panna p-10 text-center">
          <p className="text-lg font-semibold text-cielo-800">Nessun turno inserito in {meseIt(mese)}</p>
          <p className="mt-2 text-sm text-cielo-600">
            Non c'è niente da mandare all'ufficio per questo mese. I fogli compaiono quando segni i turni.
          </p>
          <Link
            to="/turni"
            className="mt-4 inline-block rounded-lg bg-cielo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-cielo-600"
          >
            Vai al Registro Turni
          </Link>
        </div>
      ) : (
        conDati.map((p) => (
          <Anteprima
            key={p.id}
            postazione={p}
            mese={mese}
            dati={dati[p.id] ?? { turni: [], reperibilita: [] }}
            inCorso={genero?.startsWith(p.id) ? (genero.split('|')[1] as 'xlsx' | 'pdf') : null}
            onGenera={(formato) => void genera(p, formato)}
          />
        ))
      )}
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
  inCorso: 'xlsx' | 'pdf' | null
  onGenera: (formato: 'xlsx' | 'pdf') => void
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
        <div className="flex gap-2">
          <button
            onClick={() => onGenera('xlsx')}
            disabled={inCorso !== null || totOre + totRep === 0}
            title={totOre + totRep === 0 ? 'Nessun turno segnato in questo mese' : 'Crea il file Excel da mandare'}
            className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
          >
            {inCorso === 'xlsx' ? 'Creazione…' : '⬇ Excel'}
          </button>
          <button
            onClick={() => onGenera('pdf')}
            disabled={inCorso !== null || totOre + totRep === 0}
            title={totOre + totRep === 0 ? 'Nessun turno segnato in questo mese' : 'Crea il PDF pronto da stampare'}
            className="rounded-lg border border-cielo-400 bg-panna px-4 py-2 text-sm font-medium text-cielo-700 transition hover:bg-cielo-50 disabled:opacity-50"
          >
            {inCorso === 'pdf' ? 'Creazione…' : '⬇ PDF'}
          </button>
        </div>
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
