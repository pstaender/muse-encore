/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's BreaksDialog (notationscene/widgets/breaksdialog.ui/.cpp, Format > Measures per system…, action
 * "measures-per-system"): locks the systems of the selection (the whole score without a range selection) to a
 * number of measures, locks every system as it is, or removes the system locks.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AddRemoveSystemLockType, addRemoveSystemLocks, prepareBreaksDialog, type MasterScore } from '../../src/index'
import { qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'

const tr = (s: string): string => qtrc('BreaksDialog', s)

const DEFAULT_INTERVAL = 4

type Choice = 'interval' | 'lock' | 'remove'

function BreaksDialog({ score, onClose }: { score: MasterScore; onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const allSelected = useRef(false)
    const [choice, setChoice] = useState<Choice>('interval')
    const [interval, setInterval] = useState(DEFAULT_INTERVAL)

    useEffect(() => {
        // BreaksDialog::showEvent
        allSelected.current = prepareBreaksDialog(score).allSelected
        scoreChanged(false)
        ref.current?.showModal()
    }, [score])

    //: `%1` will be replaced with a number input field.
    //: Text before it will appear before that number field, text after will appear after the field.
    const text = qtrc('notation/add-remove-system-breaks', 'Lock layout with %1 measure(s) per system')
    const pieces = text.split('%1')
    const part1 = pieces[0]?.trim() ?? ''
    const part2 = pieces[1]?.trim() ?? ''

    return (
        <dialog ref={ref} className="breaks-dialog" aria-labelledby="breaks-dialog-title"
            onClose={(e) => {
                // C++ keeps the selection of showEvent on Cancel
                if (e.target === e.currentTarget) {
                    onClose()
                }
            }}>
            <h2 id="breaks-dialog-title">{tr('Measures per system')}</h2>
            <form onSubmit={(e) => {
                e.preventDefault()
                // BreaksDialog::accept
                const n = choice === 'interval' ? interval : 0
                let intervalType = AddRemoveSystemLockType.MeasuresInterval
                if (choice === 'remove') {
                    intervalType = AddRemoveSystemLockType.None
                } else if (choice === 'lock') {
                    intervalType = AddRemoveSystemLockType.AfterEachSystem
                }
                addRemoveSystemLocks(score, intervalType, n, allSelected.current)
                scoreChanged(false)
                ref.current?.close()
            }}>
                <div className="radio-rows">
                    <div className="breaks-interval">
                        <label className="check">
                            <input type="radio" name="breaks" checked={choice === 'interval'} aria-label={tr('Lock layout with X measures per system')}
                                onChange={() => setChoice('interval')} />
                            {part1}
                        </label>
                        <input type="number" min={1} max={99} step={1} value={interval} aria-label={tr('Number of measures')}
                            onFocus={() => setChoice('interval')}
                            onChange={(e) => {
                                const n = Math.round(Number(e.target.value))
                                if (Number.isFinite(n) && e.target.value !== '') {
                                    setInterval(Math.max(1, Math.min(99, n)))
                                }
                            }} />
                        <span>{part2}</span>
                    </div>
                    <label className="check">
                        <input type="radio" name="breaks" checked={choice === 'lock'} onChange={() => setChoice('lock')} />
                        {tr('Add system locks to each system')}
                    </label>
                    <label className="check">
                        <input type="radio" name="breaks" checked={choice === 'remove'} onChange={() => setChoice('remove')} />
                        {tr('Remove current system locks')}
                    </label>
                </div>
                <div className="dialog-buttons">
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

/** NotationActionController::openBreaksDialog */
export function openBreaksDialog(): void {
    const score = currentScore()
    if (score) {
        setOpen({ key: ++s_key, score })
    }
}

export function BreaksDialogHost(): React.JSX.Element | null {
    const open = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_open)
    return open ? <BreaksDialog key={open.key} score={open.score} onClose={() => setOpen(null)} /> : null
}
