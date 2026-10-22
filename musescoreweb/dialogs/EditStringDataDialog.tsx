/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's EditStringData (notationscene/widgets/editstringdata.ui/.cpp, "String data"): the strings (from the
 * highest at the top; "Always open" and the pitch), New/Edit/Delete string (the pitch with EditPitch) and the number
 * of frets. The strings are given and returned from the lowest.
 */
import { useEffect, useRef, useState } from 'react'
import { qtrc, useLanguage } from '../i18n'
import { EditPitchDialog, pitchToString } from './EditPitchDialog'

export interface StringDataValue {
    strings: { pitch: number; open: boolean }[]
    frets: number
}

const tr = (s: string): string => qtrc('EditStringDataBase', s)

export function EditStringDataDialog({ value, onClose }: { value: StringDataValue; onClose: (value: StringDataValue | null) => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    // IN REVERSED ORDER (the highest string first)
    const [strings, setStrings] = useState(() => [...value.strings].reverse())
    const [frets, setFrets] = useState(value.frets)
    const [current, setCurrent] = useState(value.strings.length ? 0 : -1)
    const [pitchEdit, setPitchEdit] = useState<{ index: number | null; pitch?: number } | null>(null)
    const result = useRef<StringDataValue | null>(null)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    const alwaysOpenTip = qtrc('notation/editstringdata',
        '<b>Always open</b><br>On tablature staves, fret positions other than ‘0’ cannot be entered on strings marked ‘always open’. Useful for instruments with strings that are not on the fretboard, such as the theorbo.')
        .replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')

    return (
        <dialog ref={ref} className="edit-string-data" aria-labelledby="edit-string-data-title"
            onClose={(e) => {
                // React passes the close events of the nested dialogs (EditPitch) on to this one
                if (e.target === e.currentTarget) {
                    onClose(result.current)
                }
            }}>
            <h2 id="edit-string-data-title">{tr('String data')}</h2>
            <div className="string-data-body">
                <div className="string-data-list">
                    <p>{tr('Default strings tuning:')}</p>
                    <table className="string-table">
                        <thead>
                            <tr>
                                <th title={alwaysOpenTip}>{qtrc('notation/editstringdata', 'Always open')}</th>
                                <th>{qtrc('notation/editstringdata', 'Pitch')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {strings.map((s, i) => (
                                <tr key={i} aria-selected={i === current} onClick={() => setCurrent(i)}
                                    onDoubleClick={() => setPitchEdit({ index: i, pitch: s.pitch })}>
                                    <td>
                                        <input type="checkbox" checked={s.open} title={alwaysOpenTip}
                                            aria-label={qtrc('notation/editstringdata', 'Always open')}
                                            onChange={() => setStrings(strings.map((x, k) => k === i ? { ...x, open: !x.open } : x))} />
                                    </td>
                                    <td>{pitchToString(s.pitch)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <label className="frets">
                        <span>{tr('Number of frets:')}</span>
                        <input type="number" min={0} max={99} value={frets} onChange={e => setFrets(Number(e.target.value) || 0)} />
                    </label>
                </div>
                <div className="string-data-buttons">
                    <button type="button" className="secondary" onClick={() => setPitchEdit({ index: null })}>{tr('New string…')}</button>
                    <button type="button" className="secondary" disabled={current < 0}
                        onClick={() => setPitchEdit({ index: current, pitch: strings[current].pitch })}>{tr('Edit string…')}</button>
                    <button type="button" className="secondary" disabled={current < 0} onClick={() => {
                        const next = strings.filter((_, k) => k !== current)
                        setStrings(next)
                        setCurrent(next.length ? Math.min(current, next.length - 1) : -1)
                    }}>{tr('Delete string')}</button>
                </div>
            </div>
            <div className="dialog-buttons">
                <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                <button type="button" className="primary" onClick={() => {
                    // string tunings are copied in reversed order (from lowest to highest)
                    result.current = { strings: [...strings].reverse(), frets }
                    ref.current?.close()
                }}>{qtrc('global', 'OK')}</button>
            </div>
            {pitchEdit && (
                <EditPitchDialog midiCode={pitchEdit.pitch} onClose={(pitch) => {
                    const edit = pitchEdit
                    setPitchEdit(null)
                    if (pitch === null) {
                        return
                    }
                    if (edit.index === null) {
                        // add below selected string or at the end if no selected string
                        const i = current + 1 <= 0 ? strings.length : current + 1
                        setStrings([...strings.slice(0, i), { pitch, open: false }, ...strings.slice(i)])
                        setCurrent(i)
                    } else {
                        setStrings(strings.map((x, k) => k === edit.index ? { ...x, pitch } : x))
                    }
                }} />
            )}
        </dialog>
    )
}
