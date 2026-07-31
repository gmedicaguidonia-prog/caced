import { useState } from 'react'
import { dbLocale } from '../lib/db'
import type { SuggerimentiCedolino } from '../lib/db'
import { useToast } from '../hooks/useToast'
import { meseIt } from '../lib/formato'

/**
 * Il cedolino porta con sé la sede di servizio e il numero di iscrizione.
 * Quando sono sconosciuti CACCA non decide da sola: chiede se la sede è una
 * postazione nuova o una che c'è già (e in quel caso può allinearne il nome).
 */
export default function DomandaSede({
  suggerimenti,
  rata,
  onFine,
}: {
  suggerimenti: SuggerimentiCedolino
  rata: string
  onFine: (aggiornato: boolean) => void
}) {
  const toast = useToast()
  const s = suggerimenti.sede
  const inc = suggerimenti.iscrizione

  // se c'è un candidato somigliante parte selezionato, altrimenti "nuova"
  const [scelta, setScelta] = useState<string>(s?.candidato ? s.candidato.id : 'nuova')
  const [nomeNuova, setNomeNuova] = useState(s?.nomeProposto ?? '')
  const [allineaNome, setAllineaNome] = useState(false)
  const [registraIncarico, setRegistraIncarico] = useState(true)
  const [attesa, setAttesa] = useState(false)

  async function conferma() {
    setAttesa(true)
    let cambiato = false

    if (s) {
      const r =
        scelta === 'nuova'
          ? await dbLocale.cedolini.collegaSede({ sede: s.sede, creaNuova: true, nome: nomeNuova.trim() })
          : await dbLocale.cedolini.collegaSede({ sede: s.sede, postazioneId: scelta, allineaNome })
      if (r.error) {
        setAttesa(false)
        toast.errore(r.error.message)
        return
      }
      cambiato = true
      if (r.data?.creata) toast.ok(`Postazione «${r.data.nome}» creata e collegata alla sede del cedolino.`)
      else toast.ok(`Sede collegata a «${r.data?.nome}». Non te lo chiederò più.`)
    }

    if (inc && registraIncarico) {
      const r = await dbLocale.incarichi.salva({
        iscrizione: inc.numero,
        dal: inc.dal,
        sede: inc.sede,
        note: `ricavato dal cedolino di ${meseIt(rata)}`,
      })
      if (r.error) toast.errore(r.error.message)
      else cambiato = true
    }

    setAttesa(false)
    onFine(cambiato)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-cielo-200 bg-panna p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-cielo-800">Due domande sul cedolino di {meseIt(rata)}</h3>

        {s && (
          <section className="mt-4">
            <p className="text-sm leading-relaxed text-cielo-700">
              Il cedolino riporta la sede di servizio <b className="text-cielo-800">«{s.sede}»</b>, che non
              conosco ancora.
              {s.candidato ? (
                <>
                  {' '}
                  Somiglia molto alla tua postazione <b className="text-cielo-800">«{s.candidato.nome}»</b> (
                  {Math.round(s.candidato.somiglianza * 100)}% di somiglianza): è la stessa?
                </>
              ) : (
                ' È una postazione nuova o corrisponde a una che hai già inserito?'
              )}
            </p>

            <div className="mt-3 space-y-1.5">
              {s.postazioni.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    scelta === p.id ? 'border-cielo-400 bg-white' : 'border-cielo-200 bg-white'
                  }`}
                >
                  <input type="radio" name="sede" checked={scelta === p.id} onChange={() => setScelta(p.id)} />
                  <span className="flex-1 text-cielo-800">
                    È la stessa di <b>{p.nome}</b>
                  </span>
                  {s.candidato?.id === p.id && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      somiglia {Math.round(s.candidato.somiglianza * 100)}%
                    </span>
                  )}
                </label>
              ))}
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  scelta === 'nuova' ? 'border-cielo-400 bg-white' : 'border-cielo-200 bg-white'
                }`}
              >
                <input type="radio" name="sede" checked={scelta === 'nuova'} onChange={() => setScelta('nuova')} />
                <span className="text-cielo-800">È una postazione nuova, chiamala:</span>
                <input
                  value={nomeNuova}
                  onChange={(e) => setNomeNuova(e.target.value)}
                  onFocus={() => setScelta('nuova')}
                  className="min-w-0 flex-1 rounded-lg border border-cielo-300 bg-white px-2 py-1 text-sm text-cielo-800 outline-none focus:border-cielo-400"
                />
              </label>
            </div>

            {scelta !== 'nuova' && (
              <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg bg-cielo-50 px-3 py-2 text-sm text-cielo-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={allineaNome}
                  onChange={(e) => setAllineaNome(e.target.checked)}
                />
                <span>
                  Sincronizza anche il nome con quello ufficiale del cedolino (la postazione si chiamerà{' '}
                  <b>«{s.nomeProposto}»</b> e i fogli excel useranno «{s.sede.toUpperCase()}»).
                </span>
              </label>
            )}
          </section>
        )}

        {inc && (
          <section className="mt-5 border-t border-cielo-200 pt-4">
            <label className="flex cursor-pointer items-start gap-2 text-sm text-cielo-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={registraIncarico}
                onChange={(e) => setRegistraIncarico(e.target.checked)}
              />
              <span>
                Il cedolino riporta il numero di iscrizione <b className="text-cielo-800">{inc.numero}</b>, che
                non hai ancora fra gli incarichi: lo registro (a partire da {meseIt(inc.dal)})?
              </span>
            </label>
          </section>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => onFine(false)}
            disabled={attesa}
            className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
          >
            Non ora
          </button>
          <button
            onClick={() => void conferma()}
            disabled={attesa || (scelta === 'nuova' && !nomeNuova.trim())}
            className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
          >
            {attesa ? 'Salvataggio…' : 'Conferma'}
          </button>
        </div>
        <p className="mt-2 text-right text-[11px] text-cielo-400">
          Se rimandi, te lo richiedo riaprendo il cedolino.
        </p>
      </div>
    </div>
  )
}
