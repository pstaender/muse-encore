/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's "Select > More…" dialogs (notationscene/widgets/selectdialog.ui and selectnotedialog.ui): "Select"
 * for an element and "Select notes" for a note, with the "Select" check boxes and the "Action" radio buttons in the
 * grid layout of the .ui files. The logic is the library's SelectDialog/SelectNoteDialog.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
    SelectNoteDialog as SelectNoteDialogModel, createSelectDialog, type SelectDialog as SelectDialogModel,
    type SelectDialogAction,
} from '../../src/index'
import { qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'

type Model = SelectDialogModel | SelectNoteDialogModel

interface Cell {
    row: number
    col: number
    colspan?: number
    node: React.JSX.Element
}

function SelectDialog({ model, onClose }: { model: Model; onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const isNote = model instanceof SelectNoteDialogModel
    const context = isNote ? 'SelectNoteDialog' : 'SelectDialog'
    const tr = (s: string): string => qtrc(context, s)
    const [values, setValues] = useState(() => ({ ...model.values }) as Record<string, boolean | SelectDialogAction>)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    const set = (key: string, v: boolean | SelectDialogAction): void => {
        const next = { ...values, [key]: v }
        setValues(next)
        Object.assign(model.values, next)
    }

    const check = (key: string, label: string, enabled = true, accessibleSuffix = ''): React.JSX.Element => (
        <label className="check">
            <input type="checkbox" checked={values[key] as boolean} disabled={!enabled}
                aria-label={accessibleSuffix ? tr(label) + accessibleSuffix : undefined}
                onChange={e => set(key, e.target.checked)} />
            {tr(label)}
        </label>
    )
    const text = (s: string, enabled = true): React.JSX.Element => (
        <span className={enabled ? 'value' : 'value disabled'}>{s}</span>
    )
    const radio = (action: SelectDialogAction, label: string): React.JSX.Element => (
        <label className="check">
            <input type="radio" name="select-action" checked={values.action === action} onChange={() => set('action', action)} />
            {tr(label)}
        </label>
    )

    let cells: Cell[]
    if (model instanceof SelectNoteDialogModel) {
        cells = [
            { row: 0, col: 0, node: check('sameNotehead', 'Same notehead:', true, model.notehead) },
            { row: 0, col: 1, node: text(model.notehead) },
            { row: 1, col: 0, node: check('samePitch', 'Same pitch:', true, model.pitch) },
            { row: 1, col: 1, node: text(model.pitch) },
            { row: 2, col: 0, node: check('sameString', 'Same string:', true, model.string) },
            { row: 2, col: 1, node: text(model.string) },
            { row: 3, col: 0, node: check('sameType', 'Same type:', true, model.type) },
            { row: 3, col: 1, node: text(model.type) },
            { row: 4, col: 0, node: check('sameDurationType', 'Same note type:', true, model.durationType) },
            { row: 4, col: 1, node: text(model.durationType) },
            { row: 5, col: 0, node: check('sameDurationTicks', 'Same duration:', true, model.durationTicks) },
            { row: 5, col: 1, node: text(model.durationTicks) },
            { row: 6, col: 0, node: check('sameName', 'Same note name:', true, model.name) },
            { row: 6, col: 1, node: text(model.name) },
            { row: 7, col: 0, node: check('sameStaff', 'Same staff') },
            { row: 7, col: 1, node: check('inSelection', 'In selection', model.inSelectionEnabled) },
            { row: 8, col: 0, node: check('sameVoice', 'Same voice') },
            { row: 8, col: 1, node: check('sameSystem', 'Same system') },
            { row: 9, col: 0, node: check('sameBeat', 'Same beat') },
            { row: 9, col: 1, node: check('sameMeasure', 'Same measure') },
        ]
    } else {
        cells = [
            { row: 0, col: 0, node: <span className="label">{tr('Element type:')}</span> },
            { row: 0, col: 1, node: text(model.type) },
            { row: 1, col: 0, colspan: 2, node: <hr /> },
            { row: 2, col: 0, node: check('sameSubtype', 'Same subtype:', model.sameSubtypeEnabled) },
            { row: 2, col: 1, node: text(model.subtype, model.subtypeEnabled) },
            { row: 3, col: 0, node: check('sameStaff', 'Same staff') },
            { row: 4, col: 0, node: check('sameVoice', 'Same voice') },
            { row: 4, col: 1, node: check('inSelection', 'In selection', model.inSelectionEnabled) },
            { row: 5, col: 0, node: check('sameDuration', 'Same duration', model.sameDurationEnabled) },
            { row: 5, col: 1, node: check('sameSystem', 'Same system') },
            { row: 6, col: 0, node: check('sameBeat', 'Same beat') },
            { row: 6, col: 1, node: check('sameMeasure', 'Same measure') },
        ]
    }

    return (
        <dialog ref={ref} className="select-dialog" aria-labelledby="select-dialog-title"
            onClose={(e) => {
                if (e.target === e.currentTarget) {
                    onClose()
                }
            }}>
            <h2 id="select-dialog-title">{tr(isNote ? 'Select notes' : 'Select')}</h2>
            <form onSubmit={(e) => {
                e.preventDefault()
                model.apply()
                scoreChanged()
                ref.current?.close()
            }}>
                <fieldset className="groupbox">
                    <legend>{tr('Select')}</legend>
                    <div className="select-grid">
                        {cells.map((c, i) => (
                            <div key={i} style={{ gridRow: c.row + 1, gridColumn: `${c.col + 1} / span ${c.colspan ?? 1}` }}>{c.node}</div>
                        ))}
                    </div>
                </fieldset>
                <fieldset className="groupbox">
                    <legend>{tr('Action')}</legend>
                    <div className="select-grid">
                        <div style={{ gridRow: 1, gridColumn: 1 }}>{radio('replace', 'Replace selection')}</div>
                        <div style={{ gridRow: 1, gridColumn: 2 }}>{radio('add', 'Add to selection')}</div>
                        {/* "Search in selection" (fromSelection) is hidden in MuseScore */}
                        <div style={{ gridRow: 2, gridColumn: 2 }}>{radio('subtract', 'Subtract from selection')}</div>
                    </div>
                </fieldset>
                <div className="dialog-buttons">
                    <span className="spacer" />
                    <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                    <button type="submit" className="primary">{qtrc('global', 'OK')}</button>
                </div>
            </form>
        </dialog>
    )
}

let s_open: { key: number; model: Model } | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setOpen(v: typeof s_open): void {
    s_open = v
    for (const l of listeners) {
        l()
    }
}

/** NotationActionController::openSelectionMoreOptions: "Select notes" for a note, else "Select" */
export function openSelectDialog(): void {
    const score = currentScore()
    const model = score ? createSelectDialog(score) : null
    if (model && model.isValid()) {
        setOpen({ key: ++s_key, model })
    }
}

export function SelectDialogHost(): React.JSX.Element | null {
    const open = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_open)
    return open ? <SelectDialog key={open.key} model={open.model} onClose={() => setOpen(null)} /> : null
}
