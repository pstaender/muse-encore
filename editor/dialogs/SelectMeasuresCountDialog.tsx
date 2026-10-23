/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's SelectMeasuresCountDialog (notationscene/qml/.../SelectMeasuresCountDialog.qml): the number of measures
 * of the actions insert-measures, insert-measures-after-selection, insert-measures-at-start-of-score and append-measures
 * (NotationActionController::addMeasures).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { addMeasures, type AddBoxesTarget, type Score } from '../../src/index'
import { qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'

function SelectMeasuresCountDialog({ score, target, onClose }: { score: Score; target: AddBoxesTarget; onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const [measuresCount, setMeasuresCount] = useState(1)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    const label = qtrc('notation', 'Number of measures to insert:')
    return (
        <dialog ref={ref} className="measures-count-dialog" aria-label={label}
            onClose={(e) => {
                if (e.target === e.currentTarget) {
                    onClose()
                }
            }}>
            <form onSubmit={(e) => {
                e.preventDefault()
                if (addMeasures(score, measuresCount, target)) {
                    scoreChanged(true)
                }
                ref.current?.close()
            }}>
                <label className="measures-count">
                    <span>{label}</span>
                    <input type="number" min={1} max={999} step={1} value={measuresCount} autoFocus
                        onChange={e => {
                            const n = Math.round(Number(e.target.value))
                            if (Number.isFinite(n)) {
                                setMeasuresCount(Math.max(1, Math.min(999, n)))
                            }
                        }} />
                </label>
                <div className="dialog-buttons">
                    <span className="spacer" />
                    <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                    <button type="submit" className="primary" disabled={measuresCount < 1}>{qtrc('global', 'OK')}</button>
                </div>
            </form>
        </dialog>
    )
}

let s_open: { key: number; score: Score; target: AddBoxesTarget } | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setOpen(v: typeof s_open): void {
    s_open = v
    for (const l of listeners) {
        l()
    }
}

/** NotationActionController::addMeasures without a count: asks for the number of measures */
export function openSelectMeasuresCountDialog(target: AddBoxesTarget): void {
    const score = currentScore()
    if (score) {
        setOpen({ key: ++s_key, score, target })
    }
}

export function SelectMeasuresCountDialogHost(): React.JSX.Element | null {
    const open = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_open)
    return open
        ? <SelectMeasuresCountDialog key={open.key} score={open.score} target={open.target} onClose={() => setOpen(null)} />
        : null
}
