import { useCallback, useEffect, useState } from 'react'
import { dbLocale } from '../lib/db'
import type { Incarico, Postazione, PrezzoBenzina, Tariffa } from '../lib/db'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useEscape } from '../hooks/useEscape'
import ArchivioOnline from '../components/ArchivioOnline'
import { euro, meseIt, meseOggi } from '../lib/formato'

const NOMI_TARIFFE: Record<string, string> = {
  onorario: 'Onorario orario ACN',
  air_ora: 'Incremento orario A.I.R. Lazio',
  reperibilita: 'Turno di reperibilità',
  superfestivo_ora: 'Maggiorazione superfestivo (per ora)',
  enpam_pct: 'ENPAM (% sul lordo)',
  ra_pct: "Ritenuta d'acconto (%)",
}

const inputCls =
  'rounded-lg border border-cielo-300 bg-white px-2 py-1.5 text-sm text-cielo-800 outline-none transition focus:border-cielo-400'

export default function TariffePage() {
  const { utente } = useAuth()
  const toast = useToast()
  const admin = utente?.ruolo === 'admin'

  const [tariffe, setTariffe] = useState<Tariffa[]>([])
  const [benzina, setBenzina] = useState<PrezzoBenzina[]>([])
  const [incarichi, setIncarichi] = useState<Incarico[]>([])
  const [postazioni, setPostazioni] = useState<Postazione[]>([])
  const [cartella, setCartella] = useState('')

  const carica = useCallback(async () => {
    const [t, b, i, p, info] = await Promise.all([
      dbLocale.tariffe.list(),
      dbLocale.benzina.list(),
      dbLocale.incarichi.list(),
      dbLocale.postazioni.list(),
      dbLocale.datiApp.info(),
    ])
    setTariffe(t.data ?? [])
    setBenzina(b.data ?? [])
    setIncarichi(i.data ?? [])
    setPostazioni(p.data ?? [])
    setCartella(info.data?.cartella ?? '')
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  // --- nuova decorrenza tariffa ---
  const [nuovaTariffa, setNuovaTariffa] = useState({ tipo: 'onorario', valore: '', dal: meseOggi() })
  async function salvaTariffa() {
    const valore = Number(String(nuovaTariffa.valore).replace(',', '.'))
    const { error } = await dbLocale.tariffe.salva({ tipo: nuovaTariffa.tipo, valore, dal: nuovaTariffa.dal })
    if (error) {
      toast.errore(error.message)
      return
    }
    toast.ok('Tariffa salvata.')
    setNuovaTariffa({ ...nuovaTariffa, valore: '' })
    await carica()
  }

  // --- benzina: il prezzo non si scrive più a mano, lo calcola il programma ---
  const [meseBenzina, setMeseBenzina] = useState(meseOggi())
  // se il mese scelto non ha un prezzo suo, si mostra quello noto più vicino
  // (è la stessa ipotesi che il programma usa per la previsione)
  const prezzoDelMese =
    benzina.find((b) => b.mese === meseBenzina) ??
    benzina.filter((b) => b.mese < meseBenzina).sort((a, b) => (a.mese < b.mese ? 1 : -1))[0] ??
    null
  const daCedolino =
    Boolean(prezzoDelMese) &&
    prezzoDelMese!.mese === meseBenzina &&
    /cedolino/i.test(prezzoDelMese!.fonte ?? '')

  async function completaBenzina() {
    const { data, error } = await dbLocale.benzina.completa()
    if (error) {
      toast.errore(error.message)
      return
    }
    await carica()
    if (!data || data.length === 0) {
      toast.ok('Tutti i mesi con turni hanno già il loro prezzo.')
      return
    }
    const esatti = data.filter((d) => d.esatto).length
    toast.ok(
      `Sistemati ${data.length} mesi: ${esatti} dal cedolino (valore esatto), ${data.length - esatti} per stima.`,
    )
  }

  // --- incarichi ---
  const [nuovoIncarico, setNuovoIncarico] = useState({ iscrizione: '', dal: '', al: '', sede: '' })
  async function salvaIncarico() {
    const { error } = await dbLocale.incarichi.salva({
      iscrizione: nuovoIncarico.iscrizione,
      dal: nuovoIncarico.dal || null,
      al: nuovoIncarico.al || null,
      sede: nuovoIncarico.sede || null,
    })
    if (error) {
      toast.errore(error.message)
      return
    }
    toast.ok('Incarico salvato.')
    setNuovoIncarico({ iscrizione: '', dal: '', al: '', sede: '' })
    await carica()
  }

  const tipi = Object.keys(NOMI_TARIFFE)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-cielo-800">Tariffe e Impostazioni</h1>

      {/* ---- tariffe contrattuali ---- */}
      <section className="rounded-2xl border border-cielo-200 bg-panna p-5">
        <h2 className="text-lg font-semibold text-cielo-800">Tariffe contrattuali</h2>
        <p className="mt-1 text-sm text-cielo-600">
          Ogni tariffa ha una decorrenza (mese di lavoro da cui vale): quando ACN o A.I.R. cambiano, si
          aggiunge la nuova riga senza toccare lo storico.
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {tipi.map((tipo) => (
            <div key={tipo} className="rounded-xl border border-cielo-200 bg-white p-3">
              <p className="text-sm font-semibold text-cielo-800">{NOMI_TARIFFE[tipo]}</p>
              <ul className="mt-1 space-y-0.5 text-sm text-cielo-700">
                {tariffe
                  .filter((t) => t.tipo === tipo)
                  .sort((a, b) => (a.dal < b.dal ? -1 : 1))
                  .map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-cielo-500">
                        {t.dal <= '2020-01' ? 'dall’inizio' : `dalle ore di ${meseIt(t.dal)}`}
                        {t.note ? ` — ${t.note}` : ''}
                      </span>
                      <b>{tipo.endsWith('_pct') ? `${t.valore.toLocaleString('it-IT')} %` : euro(t.valore)}</b>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        {admin && (
          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-cielo-50 p-3">
            <label className="text-xs text-cielo-700">
              Voce
              <select
                value={nuovaTariffa.tipo}
                onChange={(e) => setNuovaTariffa({ ...nuovaTariffa, tipo: e.target.value })}
                className={`${inputCls} block`}
              >
                {tipi.map((t) => (
                  <option key={t} value={t}>
                    {NOMI_TARIFFE[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-cielo-700">
              Nuovo valore
              <input
                value={nuovaTariffa.valore}
                onChange={(e) => setNuovaTariffa({ ...nuovaTariffa, valore: e.target.value })}
                placeholder="es. 25,10"
                className={`${inputCls} block w-28`}
              />
            </label>
            <label className="text-xs text-cielo-700">
              Dalle ore di
              <input
                type="month"
                value={nuovaTariffa.dal}
                onChange={(e) => setNuovaTariffa({ ...nuovaTariffa, dal: e.target.value })}
                className={`${inputCls} block`}
              />
            </label>
            <button
              onClick={() => void salvaTariffa()}
              disabled={!nuovaTariffa.valore}
              className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
            >
              Aggiungi decorrenza
            </button>
          </div>
        )}
      </section>

      {/* ---- benzina ---- */}
      <section className="rounded-2xl border border-cielo-200 bg-panna p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-cielo-800">Prezzo benzina (chilometrico)</h2>
          <button
            onClick={() => void completaBenzina()}
            className="rounded-lg border border-cielo-300 px-3 py-1.5 text-sm font-medium text-cielo-700 transition hover:bg-cielo-50"
          >
            Completa i mesi mancanti
          </button>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-cielo-600">
          L'ACN (art. 72 c. 2) riconosce «il costo di un litro di benzina verde per ogni ora di attività»:
          il riferimento nazionale è il prezzo medio self service rilevato dal MIMIT (Osservaprezzi
          Carburanti). Il valore <b>davvero applicato dalla ASL</b> però si legge dal cedolino, quindi CACCA
          lo ricava da lì (voce 11 ÷ ore) per ogni mese già pagato; per i mesi non ancora pagati usa
          l'ultimo prezzo noto e lo segnala come stima.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-cielo-50 p-3">
          <label className="text-xs text-cielo-700">
            Mese di lavoro
            <input
              type="month"
              value={meseBenzina}
              onChange={(e) => setMeseBenzina(e.target.value)}
              className={`${inputCls} block`}
            />
          </label>
          <label className="text-xs text-cielo-700">
            Prezzo €/litro
            <input
              readOnly
              value={
                prezzoDelMese
                  ? prezzoDelMese.prezzo.toLocaleString('it-IT', { maximumFractionDigits: 5 })
                  : '—'
              }
              title={prezzoDelMese?.fonte ?? 'Nessun prezzo per questo mese'}
              className={`${inputCls} block w-32 cursor-default bg-white font-semibold`}
            />
          </label>
          {prezzoDelMese ? (
            daCedolino ? (
              <span
                className="mb-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800"
                title={prezzoDelMese.fonte ?? ''}
              >
                Prezzo da Cedolino
              </span>
            ) : (
              <span
                className="mb-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800"
                title={prezzoDelMese.fonte ?? ''}
              >
                Prezzo Ricavato
              </span>
            )
          ) : (
            <span className="mb-1.5 rounded-full border border-cielo-300 bg-white px-3 py-1.5 text-xs text-cielo-500">
              Nessun prezzo per questo mese
            </span>
          )}
        </div>
      </section>

      {/* ---- incarichi ---- */}
      <section className="rounded-2xl border border-cielo-200 bg-panna p-5">
        <h2 className="text-lg font-semibold text-cielo-800">Incarichi (numeri di iscrizione)</h2>
        <p className="mt-1 text-sm text-cielo-600">
          Traccia dei rinnovi: utile per capire a quale incarico appartiene ogni cedolino.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-cielo-500">
              <th className="py-1">Iscrizione</th>
              <th className="py-1">Dal</th>
              <th className="py-1">Al</th>
              <th className="py-1">Sede</th>
              <th className="py-1">Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {incarichi.map((i) => (
              <tr key={i.id} className="border-t border-cielo-100 text-cielo-800">
                <td className="py-1.5 font-medium">{i.iscrizione}</td>
                <td className="py-1.5">{i.dal ? meseIt(i.dal) : '—'}</td>
                <td className="py-1.5">{i.al ? meseIt(i.al) : 'in corso'}</td>
                <td className="py-1.5">{i.sede ?? '—'}</td>
                <td className="py-1.5 text-xs text-cielo-500">{i.note ?? ''}</td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={() =>
                      void dbLocale.incarichi.elimina(i.id).then(({ error }) => {
                        if (error) toast.errore(error.message)
                        else void carica()
                      })
                    }
                    className="text-xs text-red-600 hover:underline"
                  >
                    elimina
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-cielo-50 p-3">
          <label className="text-xs text-cielo-700">
            N° iscrizione
            <input
              value={nuovoIncarico.iscrizione}
              onChange={(e) => setNuovoIncarico({ ...nuovoIncarico, iscrizione: e.target.value })}
              className={`${inputCls} block w-32`}
            />
          </label>
          <label className="text-xs text-cielo-700">
            Dal
            <input
              type="month"
              value={nuovoIncarico.dal}
              onChange={(e) => setNuovoIncarico({ ...nuovoIncarico, dal: e.target.value })}
              className={`${inputCls} block`}
            />
          </label>
          <label className="text-xs text-cielo-700">
            Al
            <input
              type="month"
              value={nuovoIncarico.al}
              onChange={(e) => setNuovoIncarico({ ...nuovoIncarico, al: e.target.value })}
              className={`${inputCls} block`}
            />
          </label>
          <label className="text-xs text-cielo-700">
            Sede
            <input
              value={nuovoIncarico.sede}
              onChange={(e) => setNuovoIncarico({ ...nuovoIncarico, sede: e.target.value })}
              className={`${inputCls} block w-40`}
            />
          </label>
          <button
            onClick={() => void salvaIncarico()}
            disabled={!nuovoIncarico.iscrizione}
            className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
          >
            Aggiungi
          </button>
        </div>
      </section>

      {/* ---- postazioni ---- */}
      <Postazioni postazioni={postazioni} onCambiato={carica} />

      {/* ---- dati ---- */}
      <section id="dati" className="rounded-2xl border border-cielo-200 bg-panna p-5">
        <h2 className="text-lg font-semibold text-cielo-800">I tuoi dati</h2>
        <p className="mt-1 text-sm text-cielo-600">
          Archivio: <b className="break-all">{cartella}</b> — con copia di sicurezza automatica
          giornaliera nella sottocartella <b>backup</b> (ne restano 30).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => void dbLocale.datiApp.apriCartella().then(({ error }) => error && toast.errore(error.message))}
            className="rounded-lg border border-cielo-300 px-3 py-1.5 text-sm text-cielo-700 transition hover:bg-cielo-50"
          >
            Apri la cartella dati
          </button>
          <button
            onClick={() =>
              void dbLocale.datiApp.esporta().then(({ data, error }) => {
                if (error) toast.errore(error.message)
                else if (data) toast.ok(`Esportazione creata: ${data.percorso}`)
              })
            }
            className="rounded-lg border border-cielo-300 px-3 py-1.5 text-sm text-cielo-700 transition hover:bg-cielo-50"
          >
            Esporta tutti i dati (file di scorta)
          </button>
        </div>
      </section>

      {/* ---- archivio online cifrato ---- */}
      <ArchivioOnline />
    </div>
  )
}

/** Elenco postazioni con aggiunta, modifica e cancellazione (protetta). */
function Postazioni({ postazioni, onCambiato }: { postazioni: Postazione[]; onCambiato: () => Promise<void> }) {
  const toast = useToast()
  const [modifica, setModifica] = useState<Partial<Postazione> | null>(null)
  useEscape(() => setModifica(null))

  async function salva() {
    if (!modifica) return
    const { error } = await dbLocale.postazioni.salva(modifica)
    if (error) {
      toast.errore(error.message)
      return
    }
    toast.ok(modifica.id ? 'Postazione aggiornata.' : 'Postazione aggiunta.')
    setModifica(null)
    await onCambiato()
  }

  async function elimina(p: Postazione) {
    if (!window.confirm(`Eliminare definitivamente la postazione «${p.nome}»?`)) return
    const { error } = await dbLocale.postazioni.elimina(p.id)
    if (error) {
      // il motore spiega perché non si può (turni collegati): si mostra com'è
      toast.errore(error.message)
      return
    }
    toast.ok('Postazione eliminata.')
    await onCambiato()
  }

  return (
    <section className="rounded-2xl border border-cielo-200 bg-panna p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-cielo-800">Postazioni</h2>
        <button
          onClick={() => setModifica({ nome: '', nome_excel: '', suffisso_foglio: '', attiva: true })}
          className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
        >
          + Aggiungi postazione
        </button>
      </div>
      <p className="mt-1 text-sm text-cielo-600">
        Il «nome per l'excel» è l'intestazione che l'ufficio si aspetta: RIEPILOGO ORE C.A. POSTAZIONE DI …
      </p>

      {postazioni.length === 0 && (
        <p className="mt-3 rounded-xl bg-cielo-50 px-4 py-6 text-center text-sm text-cielo-600">
          Nessuna postazione. Aggiungila qui, oppure importa un cedolino: CACCA ti proporrà di crearla con i
          dati letti dal PDF.
        </p>
      )}

      <ul className="mt-3 space-y-1.5 text-sm">
        {postazioni.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-cielo-200 bg-white px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <b className={p.attiva ? 'text-cielo-800' : 'text-cielo-400'}>{p.nome}</b>
              {!p.attiva && <span className="ml-1.5 text-xs text-cielo-400">(disattivata)</span>}
              <span className="block text-xs text-cielo-500">
                excel: «{p.nome_excel}»
                {p.suffisso_foglio ? ` · foglio con suffisso «${p.suffisso_foglio}»` : ''}
                {p.sede_cedolino ? ` · sede sul cedolino: ${p.sede_cedolino}` : ' · sede sul cedolino non ancora collegata'}
              </span>
            </span>
            <span className="shrink-0 text-xs text-cielo-500">
              {p.turni} turni · {p.reperibilita} rep.
            </span>
            <button onClick={() => setModifica(p)} className="shrink-0 text-xs font-medium text-cielo-600 hover:underline">
              modifica
            </button>
            <button
              onClick={() => void elimina(p)}
              disabled={p.turni + p.reperibilita > 0}
              title={
                p.turni + p.reperibilita > 0
                  ? 'Ha dei turni collegati: non si può eliminare (puoi disattivarla)'
                  : 'Elimina la postazione'
              }
              className="shrink-0 text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-cielo-300 disabled:no-underline"
            >
              elimina
            </button>
          </li>
        ))}
      </ul>

      {modifica && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4" onClick={() => setModifica(null)}>
          <div
            className="w-full max-w-md rounded-2xl border border-cielo-200 bg-panna p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-cielo-800">
              {modifica.id ? 'Modifica postazione' : 'Nuova postazione'}
            </h3>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-cielo-700">Nome (come lo chiami tu) *</span>
                <input
                  autoFocus
                  value={modifica.nome ?? ''}
                  onChange={(e) => setModifica({ ...modifica, nome: e.target.value })}
                  placeholder="es. Palombara Notte"
                  className={`${inputCls} w-full`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-cielo-700">Nome per l'excel dell'ufficio *</span>
                <input
                  value={modifica.nome_excel ?? ''}
                  onChange={(e) => setModifica({ ...modifica, nome_excel: e.target.value })}
                  placeholder="es. PALOMBARA NOTTE"
                  className={`${inputCls} w-full`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-cielo-700">
                  Suffisso del foglio (facoltativo)
                </span>
                <input
                  value={modifica.suffisso_foglio ?? ''}
                  onChange={(e) => setModifica({ ...modifica, suffisso_foglio: e.target.value })}
                  placeholder="es.  PALOMBARA → foglio «MARZO 2026 PALOMBARA»"
                  className={`${inputCls} w-full`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-cielo-700">
                  Sede sul cedolino (facoltativo, si impara da sola)
                </span>
                <input
                  value={modifica.sede_cedolino ?? ''}
                  onChange={(e) => setModifica({ ...modifica, sede_cedolino: e.target.value })}
                  placeholder="es. PALOMBARA (PPI)"
                  className={`${inputCls} w-full`}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-cielo-800">
                <input
                  type="checkbox"
                  checked={modifica.attiva !== false}
                  onChange={(e) => setModifica({ ...modifica, attiva: e.target.checked })}
                />
                Attiva (compare nei calendari e nei riepiloghi)
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setModifica(null)}
                className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
              >
                Annulla
              </button>
              <button
                onClick={() => void salva()}
                disabled={!modifica.nome?.trim() || !modifica.nome_excel?.trim()}
                className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
