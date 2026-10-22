/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's EditPitch (notationscene/widgets/editpitch.ui/.cpp, "Note selection"): selects a MIDI pitch by its note
 * name in a table of octaves (rows, from octave 9 at the top) and notes (columns, C to the C of the next octave).
 * Double click or OK chooses the pitch. Also pitchToString (muse::pitchToString with the octave).
 */
import { useEffect, useRef, useState } from 'react'
import { qtrc, useLanguage } from '../i18n'

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C']
const ROWS = 11
const COLS = 13
const MAX_PITCH = 127

/** muse::pitchToString(pitch, addoctave = true): "C4", translated (global/pitchName) */
export function pitchToString(pitch: number): string {
    if (pitch < 0 || pitch > 127) {
        return ''
    }
    const octave = Math.trunc(pitch / 12) - 1
    return qtrc('global/pitchName', `${NOTE_NAMES[pitch % 12]}${octave}`)
}

const tr = (s: string): string => qtrc('EditPitchBase', s)

/** midiCode: the pitch selected at first (default: middle C) */
export function EditPitchDialog({ midiCode = 60, onClose }: { midiCode?: number; onClose: (pitch: number | null) => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const [current, setCurrent] = useState({ row: ROWS - 1 - Math.trunc(midiCode / 12), col: midiCode % 12 })
    const result = useRef<number | null>(null)
    const cellRefs = useRef<(HTMLTableCellElement | null)[]>([])

    useEffect(() => {
        ref.current?.showModal()
        cellRefs.current[current.row * COLS + current.col]?.focus()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // on_tableWidget_cellDoubleClicked: the topmost row contains notes for 10-th MIDI octave (numbered as '9')
    const choose = (row: number, col: number): void => {
        result.current = Math.min((ROWS - 1 - row) * 12 + col, MAX_PITCH)
        ref.current?.close()
    }
    const exists = (row: number, col: number): boolean => !(row === 0 && col > 7) // MIDI notes above G9

    const move = (row: number, col: number): void => {
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS || !exists(row, col)) {
            return
        }
        setCurrent({ row, col })
        cellRefs.current[row * COLS + col]?.focus()
    }

    return (
        <dialog ref={ref} className="edit-pitch" aria-labelledby="edit-pitch-title" onClose={(e) => {
            if (e.target === e.currentTarget) {
                onClose(result.current)
            }
        }}>
            <h2 id="edit-pitch-title">{tr('Note selection')}</h2>
            <p>{tr('Select note:')}</p>
            <table className="pitch-table" role="grid">
                <thead>
                    <tr><th />{NOTE_NAMES.map((n, i) => <th key={i} scope="col">{tr(n)}</th>)}</tr>
                </thead>
                <tbody>
                    {Array.from({ length: ROWS }, (_, row) => (
                        <tr key={row}>
                            <th scope="row">{tr(`Octave ${9 - row}`)}</th>
                            {Array.from({ length: COLS }, (_, col) => {
                                if (!exists(row, col)) {
                                    return <td key={col} />
                                }
                                // the last column is the C of the next octave
                                const octave = col === COLS - 1 ? 10 - row : 9 - row
                                const selected = current.row === row && current.col === col
                                return (
                                    <td key={col} ref={el => { cellRefs.current[row * COLS + col] = el }} role="gridcell"
                                        aria-selected={selected} tabIndex={selected ? 0 : -1}
                                        onClick={() => setCurrent({ row, col })} onDoubleClick={() => choose(row, col)}
                                        onKeyDown={(e) => {
                                            const d: Record<string, [number, number]> = {
                                                ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
                                            }
                                            if (d[e.key]) {
                                                e.preventDefault()
                                                move(row + d[e.key][0], col + d[e.key][1])
                                            } else if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault()
                                                choose(row, col)
                                            }
                                        }}>
                                        {qtrc('global/pitchName', `${NOTE_NAMES[col]}${octave}`)}
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="dialog-buttons">
                <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                <button type="button" className="primary" onClick={() => choose(current.row, current.col)}>{qtrc('global', 'OK')}</button>
            </div>
        </dialog>
    )
}
