/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The dialogs of the palettes (ports of src/palette/qml/MuseScore/Palette/PalettePropertiesDialog.qml,
 * PaletteCellPropertiesDialog.qml with PalettePropertyItem.qml, the models PalettePropertiesModel /
 * PaletteCellPropertiesModel, and the questions of UserPaletteController / PaletteProvider): the properties change the
 * palette at once, Cancel restores the original values (the models' reject()).
 * The dialogs are opened through openPaletteDialog / askPaletteQuestion and shown by <PaletteDialogs />.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
    RemoveAction, paletteCellProperties, paletteProperties, setPaletteCellProperties, setPaletteProperties,
    type PaletteCellConfig, type PaletteConfig, type RemoveQuestion,
} from '../../../src/index'
import { qtrc, useLanguage } from '../../i18n'

type DialogRequest =
    | { kind: 'palette'; paletteId: string }
    | { kind: 'cell'; cellId: string }
    | { kind: 'question'; text: string; buttons: { value: string; label: string; primary?: boolean }[]; resolve: (v: string) => void }

let s_dialog: DialogRequest | null = null
const listeners = new Set<() => void>()

function setDialog(d: DialogRequest | null): void {
    s_dialog = d
    for (const l of listeners) {
        l()
    }
}

/** opens "Palette properties" or "Palette cell properties" */
export function openPaletteDialog(d: { kind: 'palette'; paletteId: string } | { kind: 'cell'; cellId: string }): void {
    setDialog(d)
}

/** a question with buttons (C++ IInteractive::question); resolves to the value of the button ('' if closed) */
export function askPaletteQuestion(text: string, buttons: { value: string; label: string; primary?: boolean }[]): Promise<string> {
    return new Promise((resolve) => {
        setDialog({ kind: 'question', text, buttons, resolve })
    })
}

/** UserPaletteController::showHideOrDeleteDialog / the "permanently delete" question (AskRemove of the library) */
export function askRemove(q: RemoveQuestion): Promise<RemoveAction> {
    const text = qtrc('palette', q.question)
    if (q.buttons === 'hideOrDelete') {
        return askPaletteQuestion(text, [
            { value: 'hide', label: qtrc('palette', 'Hide') },
            { value: 'delete', label: qtrc('palette', 'Delete permanently') },
            { value: 'cancel', label: qtrc('global', 'Cancel'), primary: true },
        ]).then(v => v === 'hide' ? RemoveAction.Hide : v === 'delete' ? RemoveAction.DeletePermanently : RemoveAction.NoAction)
    }
    return askPaletteQuestion(text, [
        { value: 'yes', label: qtrc('global', 'Yes') },
        { value: 'no', label: qtrc('global', 'No'), primary: true },
    ]).then(v => v === 'yes' ? RemoveAction.DeletePermanently : RemoveAction.NoAction)
}

function formatNumber(v: number, decimals: number): string {
    return Number.isFinite(v) ? String(Number(v.toFixed(decimals))) : ''
}

/** PalettePropertyItem: a title and an IncrementalPropertyControl (spin box with unit) */
function PropertyItem({ title, value, step, min, max, unit = '', decimals = 2, onChange, autoFocus = false }: {
    title: string
    value: number
    step: number
    min: number
    max: number
    unit?: string
    decimals?: number
    onChange: (v: number) => void
    autoFocus?: boolean
}): React.JSX.Element {
    const shown = formatNumber(value, decimals)
    const [text, setText] = useState(shown)
    useEffect(() => setText(shown), [shown])
    const commit = (t: string): void => {
        const v = parseFloat(t.replace(',', '.'))
        if (Number.isFinite(v)) {
            onChange(Math.min(max, Math.max(min, v)))
        } else {
            setText(shown)
        }
    }
    return (
        <label className="palette-property">
            <span>{title}</span>
            <span className="insp-spinbox">
                <input type="text" inputMode="decimal" value={text} aria-label={title} autoFocus={autoFocus}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={(e) => e.target.value !== shown && commit(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            commit(text)
                        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault()
                            const v = (Number.isFinite(parseFloat(text)) ? parseFloat(text) : 0) + (e.key === 'ArrowUp' ? step : -step)
                            commit(formatNumber(v, decimals))
                        }
                    }} />
                {unit && <span className="insp-unit">{unit}</span>}
            </span>
        </label>
    )
}

function useModal(): React.RefObject<HTMLDialogElement | null> {
    const ref = useRef<HTMLDialogElement>(null)
    useEffect(() => {
        if (ref.current && !ref.current.open) {
            ref.current.showModal()
        }
    }, [])
    return ref
}

function PalettePropertiesDialog({ paletteId, onClose }: { paletteId: string; onClose: () => void }): React.JSX.Element | null {
    useLanguage()
    const ref = useModal()
    const [origin] = useState<PaletteConfig | null>(() => paletteProperties(paletteId))
    const [config, setConfigState] = useState<PaletteConfig | null>(origin)
    if (!origin || !config) {
        return null
    }
    const setConfig = (c: PaletteConfig): void => {
        setConfigState(c)
        setPaletteProperties(paletteId, c)
    }
    const reject = (): void => {
        setPaletteProperties(paletteId, origin)
        onClose()
    }
    return (
        <dialog ref={ref} className="palette-properties" aria-labelledby="palette-properties-title"
            onCancel={(e) => { e.preventDefault(); reject() }}>
            <h2 id="palette-properties-title">{qtrc('palette', 'Palette properties')}</h2>
            <div className="palette-properties-section">
                <label className="palette-properties-heading" htmlFor="palette-name">{qtrc('palette', 'Name')}</label>
                <input id="palette-name" type="text" value={config.name} autoFocus
                    onChange={(e) => setConfig({ ...config, name: e.target.value })} />
            </div>
            <hr />
            <div className="palette-properties-heading">{qtrc('palette', 'Cell size')}</div>
            <div className="palette-properties-grid">
                <PropertyItem title={qtrc('palette', 'Width')} value={config.size.width} step={1} min={1} max={500} decimals={0}
                    onChange={(v) => setConfig({ ...config, size: { ...config.size, width: Math.round(v) } })} />
                <PropertyItem title={qtrc('palette', 'Height')} value={config.size.height} step={1} min={1} max={500} decimals={0}
                    onChange={(v) => setConfig({ ...config, size: { ...config.size, height: Math.round(v) } })} />
                <PropertyItem title={qtrc('palette', 'Element offset')} value={config.elementOffset} step={0.1} min={-10} max={10}
                    unit={qtrc('global', 'sp')} onChange={(v) => setConfig({ ...config, elementOffset: v })} />
                <PropertyItem title={qtrc('palette', 'Scale')} value={config.scale} step={0.1} min={0.1} max={15}
                    onChange={(v) => setConfig({ ...config, scale: v })} />
            </div>
            <label className="palette-properties-check">
                <input type="checkbox" checked={config.showGrid} onChange={(e) => setConfig({ ...config, showGrid: e.target.checked })} />
                {qtrc('palette', 'Show grid')}
            </label>
            <div className="dialog-buttons">
                <button type="button" className="secondary" onClick={reject}>{qtrc('global', 'Cancel')}</button>
                <button type="button" className="primary" onClick={onClose}>{qtrc('global', 'OK')}</button>
            </div>
        </dialog>
    )
}

function PaletteCellPropertiesDialog({ cellId, onClose }: { cellId: string; onClose: () => void }): React.JSX.Element | null {
    useLanguage()
    const ref = useModal()
    const [origin] = useState<PaletteCellConfig | null>(() => paletteCellProperties(cellId))
    const [config, setConfigState] = useState<PaletteCellConfig | null>(origin)
    if (!origin || !config) {
        return null
    }
    const setConfig = (c: PaletteCellConfig): void => {
        setConfigState(c)
        setPaletteCellProperties(cellId, c)
    }
    const reject = (): void => {
        setPaletteCellProperties(cellId, origin)
        onClose()
    }
    return (
        <dialog ref={ref} className="palette-properties" aria-labelledby="palette-cell-properties-title"
            onCancel={(e) => { e.preventDefault(); reject() }}>
            <h2 id="palette-cell-properties-title">{qtrc('palette', 'Palette cell properties')}</h2>
            <div className="palette-properties-section">
                <label className="palette-properties-heading" htmlFor="palette-cell-name">{qtrc('palette', 'Name')}</label>
                <input id="palette-cell-name" type="text" value={config.name} autoFocus
                    onChange={(e) => setConfig({ ...config, name: e.target.value })} />
            </div>
            <hr />
            <div className="palette-properties-heading">{qtrc('palette', 'Content offset')}</div>
            <div className="palette-properties-grid">
                {/* "sp": abbreviation of "spatium" */}
                <PropertyItem title={qtrc('palette', 'X')} value={config.xOffset} step={1} min={-10} max={10} unit={qtrc('global', 'sp')}
                    onChange={(v) => setConfig({ ...config, xOffset: v })} />
                <PropertyItem title={qtrc('palette', 'Y')} value={config.yOffset} step={1} min={-10} max={10} unit={qtrc('global', 'sp')}
                    onChange={(v) => setConfig({ ...config, yOffset: v })} />
                <PropertyItem title={qtrc('palette', 'Content scale')} value={config.scale} step={0.1} min={0.1} max={10}
                    onChange={(v) => setConfig({ ...config, scale: v })} />
            </div>
            <label className="palette-properties-check">
                <input type="checkbox" checked={config.drawStaff} onChange={(e) => setConfig({ ...config, drawStaff: e.target.checked })} />
                {qtrc('palette', 'Draw staff')}
            </label>
            <div className="dialog-buttons">
                <button type="button" className="secondary" onClick={reject}>{qtrc('global', 'Cancel')}</button>
                <button type="button" className="primary" onClick={onClose}>{qtrc('global', 'OK')}</button>
            </div>
        </dialog>
    )
}

function QuestionDialog({ text, buttons, onAnswer }: {
    text: string
    buttons: { value: string; label: string; primary?: boolean }[]
    onAnswer: (v: string) => void
}): React.JSX.Element {
    const ref = useModal()
    return (
        <dialog ref={ref} className="confirm palette-question" aria-describedby="palette-question-text"
            onCancel={(e) => { e.preventDefault(); onAnswer('') }}>
            <p id="palette-question-text">{text}</p>
            <div className="dialog-buttons">
                {buttons.map(b => (
                    <button key={b.value} type="button" className={b.primary ? 'primary' : 'secondary'} autoFocus={b.primary}
                        data-value={b.value} onClick={() => onAnswer(b.value)}>
                        {b.label}
                    </button>
                ))}
            </div>
        </dialog>
    )
}

/** the open palette dialog (rendered by the palettes panel) */
export function PaletteDialogs(): React.JSX.Element | null {
    const d = useSyncExternalStore(
        (l) => {
            listeners.add(l)
            return () => listeners.delete(l)
        },
        () => s_dialog,
    )
    if (!d) {
        return null
    }
    const close = (): void => setDialog(null)
    switch (d.kind) {
    case 'palette':
        return <PalettePropertiesDialog key={d.paletteId} paletteId={d.paletteId} onClose={close} />
    case 'cell':
        return <PaletteCellPropertiesDialog key={d.cellId} cellId={d.cellId} onClose={close} />
    case 'question':
        return (
            <QuestionDialog text={d.text} buttons={d.buttons} onAnswer={(v) => {
                close()
                d.resolve(v)
            }} />
        )
    }
}
