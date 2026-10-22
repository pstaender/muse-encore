/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's RealizeHarmonyDialog (notationscene/widgets/realizeharmonydialog.ui/.cpp with the VoicingSelect widget,
 * the action realize-chord-symbols): the selected chord symbols, "Override with custom options" (interpretation,
 * voicing, duration) and "Show more…" (the table of the chords).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
    HDuration, Voicing, realizableChordSymbols, realizeChordSymbols, type MasterScore, type RealizableChordSymbol,
} from '../../src/index'
import { qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'

const tr = (s: string): string => qtrc('RealizeHarmonyDialogBase', s)
const trv = (s: string): string => qtrc('VoicingSelect', s)

function RealizeChordSymbolsDialog({ score, onClose }: { score: MasterScore; onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const [chords] = useState<RealizableChordSymbol[]>(() => realizableChordSymbols(score))
    const [override, setOverride] = useState(false)
    const [literal, setLiteral] = useState(true)
    const [voicing, setVoicing] = useState(Voicing.AUTO)
    const [duration, setDuration] = useState(HDuration.UNTIL_NEXT_CHORD_SYMBOL)
    const [showTable, setShowTable] = useState(false)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    const select = (label: string, value: number, set: (v: number) => void, items: string[]): React.JSX.Element => (
        <label className="field-row">
            <span>{trv(label)}</span>
            <select value={value} disabled={!override} onChange={e => set(Number(e.target.value))}>
                {items.map((t, i) => <option key={i} value={i}>{trv(t)}</option>)}
            </select>
        </label>
    )

    return (
        <dialog ref={ref} className="realize-dialog" aria-labelledby="realize-dialog-title" title={tr('Convert chord symbols into notes')}
            onClose={(e) => {
                if (e.target === e.currentTarget) {
                    onClose()
                }
            }}>
            <h2 id="realize-dialog-title">{tr('Realize chord symbols')}</h2>
            <form onSubmit={(e) => {
                e.preventDefault()
                // RealizeHarmonyDialog::accept
                if (realizeChordSymbols(score, override ? { literal, voicing, duration } : null)) {
                    scoreChanged()
                }
                ref.current?.close()
            }}>
                <div className="chord-list">
                    <span>{tr('Chord symbols to be realized:')}</span>
                    <span className="chord-names">{chords.map(c => c.name).join(' ')}</span>
                </div>
                <fieldset className="groupbox">
                    <legend>
                        <label className="check">
                            <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
                            {tr('Override with custom options')}
                        </label>
                    </legend>
                    {select('Interpretation:', literal ? 1 : 0, v => setLiteral(v === 1), ['Jazz', 'Literal'])}
                    {select('Voicing:', voicing, setVoicing,
                        ['Auto', 'Root only', 'Close', 'Drop two', 'Six note', 'Four note', 'Three note'])}
                    {select('Duration:', duration, setDuration, ['Until next chord symbol', 'Until measure end', 'Chord/rest duration'])}
                </fieldset>
                {showTable && (
                    <table className="chord-table">
                        <thead>
                            <tr><th>ID</th><th>Name</th><th>Intervals</th><th>Notes</th></tr>
                        </thead>
                        <tbody>
                            {chords.map((c, i) => (
                                <tr key={i}><td>{c.id}</td><td>{c.name}</td><td>{c.intervals}</td><td>{c.noteNames}</td></tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div className="dialog-buttons">
                    <button type="button" className="secondary" onClick={() => setShowTable(!showTable)}>
                        {showTable ? qtrc('global', 'Show less…') : tr('Show more…')}
                    </button>
                    <span className="spacer" />
                    <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                    <button type="submit" className="primary">{qtrc('global', 'OK')}</button>
                </div>
            </form>
        </dialog>
    )
}

let s_open: { key: number; score: MasterScore } | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setOpen(v: typeof s_open): void {
    s_open = v
    for (const l of listeners) {
        l()
    }
}

/** NotationActionController::openRealizeChordSymbolsDialog */
export function openRealizeChordSymbolsDialog(): void {
    const score = currentScore()
    if (score) {
        setOpen({ key: ++s_key, score })
    }
}

export function RealizeChordSymbolsDialogHost(): React.JSX.Element | null {
    const open = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_open)
    return open ? <RealizeChordSymbolsDialog key={open.key} score={open.score} onClose={() => setOpen(null)} /> : null
}
