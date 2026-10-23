/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's Customize kit dialog (palette/widgets/customizekitdialog.ui, action "customize-kit") with the library's
 * CustomizeKitDialog: the drums of the instrument's drumset (pitch list), the settings of the current drum (applied to
 * the score at once), the example note, Load…/Save as… of .drm files, and the percussion shortcut dialog
 * (EditPercussionShortcutDialog.qml with EditPercussionShortcutModel).
 */
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import {
    canCustomizeKit as libCanCustomizeKit, createCustomizeKitDialog, customizeKitNoteheadSymbols, CustomizeKitDialog, DirectionV, drawCustomizeKitExample,
    NOTE_HEAD_NAMES, NoteHeadGroup, NoteHeadType, type Score,
} from '../../src/index'
import { allShortcuts, formatShortcut } from '../actions/actions'
import { showMessage } from '../components/MessageBox'
import { pickFile, saveToComputer, type FilePickerType } from '../files'
import { arg, qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'
import './customizekit.css'

const tr = (s: string): string => qtrc('CustomizeKitDialog', s)

const DRM_MIME = 'application/x-musescore-drumset+xml'

function drmType(): FilePickerType {
    return { description: qtrc('palette', 'MuseScore drumset file'), accept: { [DRM_MIME]: ['.drm'] } }
}

type SortColumn = 'pitch' | 'note' | 'shortcut' | 'name'

/** the example: the chord of the current drum (PaletteWidget drumNote, 70 x 80) */
function Example({ dialog, version }: { dialog: CustomizeKitDialog; version: number }): React.JSX.Element {
    const ref = useRef<HTMLCanvasElement>(null)
    useEffect(() => {
        const canvas = ref.current
        if (!canvas) {
            return
        }
        const dpr = window.devicePixelRatio || 1
        canvas.width = 70 * dpr
        canvas.height = 80 * dpr
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        drawCustomizeKitExample(dialog, ctx, { width: 70, height: 80, dpr, color: getComputedStyle(canvas).color })
    }, [dialog, version])
    return <canvas ref={ref} className="customize-kit-example" style={{ width: 70, height: 80 }} aria-hidden="true" />
}

/** "Ctrl+Shift+A" style text of a key event (single keys, like QKeySequence(Qt::Key)) */
function keyText(e: React.KeyboardEvent): string | null {
    const key = e.key
    // EditPercussionShortcutModel::needIgnoreKey
    if (['Enter', 'Delete', 'Backspace', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Insert', 'Home', 'PageUp',
        'PageDown', 'End', 'Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(key) || /^[0-9]$/.test(key)) {
        return null
    }
    if (key.length === 1) {
        return key.toUpperCase()
    }
    return /^F\d+$/.test(key) ? key : null
}

/** EditPercussionShortcutDialog: resolves with the new shortcut and the conflicting drum, or null (cancelled) */
function ShortcutDialog({ title, origin, drums, onClose }: {
    title: string
    origin: string
    drums: { pitch: number; title: string; shortcut: string }[]
    onClose: (result: { shortcut: string; conflictDrumPitch: number } | null) => void
}): React.JSX.Element {
    const ref = useRef<HTMLDialogElement>(null)
    const [shortcut, setShortcut] = useState<string | null>(null)
    const [cleared, setCleared] = useState(false)
    useEffect(() => {
        ref.current?.showModal()
    }, [])
    const trs = (s: string): string => qtrc('shortcuts', s)
    // checkDrumShortcutsForConflict / checkApplicationShortcutsForConflict
    const drumConflict = shortcut ? drums.find(d => d.shortcut === shortcut) ?? null : null
    const appConflict = shortcut && !drumConflict ? allShortcuts().find(s => s.shortcut === shortcut) ?? null : null
    const conflictTitle = drumConflict?.title ?? appConflict?.title ?? ''
    const close = (result: { shortcut: string; conflictDrumPitch: number } | null): void => {
        ref.current?.close()
        onClose(result)
    }
    const save = async (): Promise<void> => {
        // trySave
        const newShortcut = shortcut ?? ''
        const alreadyEmpty = !origin && cleared
        if (alreadyEmpty || origin === newShortcut || (shortcut === null && !cleared)) {
            close(null)
            return
        }
        if (conflictTitle) {
            const text = appConflict
                ? arg(trs('When this instrument is selected, <b>%1</b> will no longer run <b>%2</b>.'), appConflict.shortcut, appConflict.title)
                : `${arg(trs('This shortcut is already assigned to: <b>%1</b>'), conflictTitle)}<br><br>${arg(trs('Are you sure you want to assign it to <b>%1</b> instead?'), title)}`
            const button = await showMessage(arg(trs('Reassign shortcut for <b>%1</b>'), title).replace(/<\/?b>/g, ''),
                text.replace(/<br>/g, '\n').replace(/<\/?b>/g, ''), ['cancel', 'ok'])
            if (button !== 'ok') {
                return
            }
        }
        close({ shortcut: newShortcut, conflictDrumPitch: drumConflict ? drumConflict.pitch : -1 })
    }
    return (
        <dialog ref={ref} className="percussion-shortcut" aria-labelledby="percussion-shortcut-title"
            onCancel={(e) => {
                e.preventDefault()
                close(null)
            }}>
            <h2 id="percussion-shortcut-title">{trs('Enter shortcut')}</h2>
            <p>{trs('Define percussion keyboard shortcut')}</p>
            <div className="shortcut-input" tabIndex={0} autoFocus role="textbox" aria-label={trs('Enter shortcut')}
                onKeyDown={(e) => {
                    const t = keyText(e)
                    if (t) {
                        e.preventDefault()
                        e.stopPropagation()
                        setShortcut(t)
                        setCleared(false)
                    }
                }}>
                {shortcut ?? (cleared ? '' : origin)}
            </div>
            {conflictTitle && <p className="info">{arg(trs('This shortcut is already assigned to: <b>%1</b>'), conflictTitle).replace(/<\/?b>/g, '')}</p>}
            <div className="dialog-buttons">
                <button type="button" className="secondary" onClick={() => {
                    setShortcut(null)
                    setCleared(true)
                }}>{qtrc('global', 'Clear')}</button>
                <span className="spacer" />
                <button type="button" className="secondary" onClick={() => close(null)}>{qtrc('global', 'Cancel')}</button>
                <button type="button" className="primary" onClick={() => void save()}>{qtrc('global', 'Save')}</button>
            </div>
        </dialog>
    )
}

function CustomizeKit({ dialog, onClose }: { dialog: CustomizeKitDialog; onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const [version, rerender] = useReducer((n: number) => n + 1, 0)
    const [sort, setSort] = useState<{ column: SortColumn; descending: boolean }>({ column: 'name', descending: true })
    const [shortcutOpen, setShortcutOpen] = useState(false)
    const done = useRef(false)

    useEffect(() => {
        ref.current?.showModal()
        listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center' })
    }, [])

    /** a change of the dialog (the score changed: the view is redrawn) */
    const changed = (f: () => void): void => {
        f()
        scoreChanged(false)
        rerender()
    }
    const enabled = dialog.pitchControlsEnabled()
    const custom = dialog.customGroup()
    const symbols = customizeKitNoteheadSymbols()
    const noteheadCombo = (type: NoteHeadType, label: string, idx: 0 | 1 | 2 | 3): React.JSX.Element => (
        <label className="field-row">
            <span>{label}</span>
            <select value={dialog.customNoteheads()[idx]} disabled={!enabled || !custom}
                onChange={(e) => {
                    dialog.setCustomNotehead(type, Number(e.target.value))
                    rerender()
                }}>
                {symbols.map(id => <option key={id} value={id}>{CustomizeKitDialog.symbolName(id)}</option>)}
            </select>
        </label>
    )
    const header = (column: SortColumn, text: string): React.JSX.Element => (
        <button type="button" role="columnheader" className={`col-${column}`}
            aria-sort={sort.column === column ? (sort.descending ? 'descending' : 'ascending') : undefined}
            onClick={() => {
                const next = { column, descending: sort.column === column ? !sort.descending : false }
                dialog.sortRows(next.column, next.descending)
                setSort(next)
            }}>{text}</button>
    )
    const rows = dialog.rows()
    const current = dialog.currentPitch()

    return (
        <dialog ref={ref} className="customize-kit" aria-labelledby="customize-kit-title"
            onClose={(e) => {
                if (e.target !== e.currentTarget) {
                    return
                }
                if (!done.current) {
                    dialog.cancel() // Escape: the original drumset
                    scoreChanged(false)
                }
                onClose()
            }}>
            <h2 id="customize-kit-title">{tr('Customize kit')}</h2>
            <div className="customize-kit-content">
                <div className="customize-kit-list" role="grid" aria-label={tr('Customize kit')}>
                    <div className="customize-kit-header" role="row">
                        {header('pitch', '')}{header('note', tr('Note'))}{header('shortcut', tr('Shortcut'))}{header('name', tr('Name'))}
                    </div>
                    <div className="customize-kit-rows" ref={listRef} tabIndex={0}
                        onKeyDown={(e) => {
                            const i = rows.findIndex(r => r.pitch === current)
                            const next = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : -1
                            if (next >= 0 && next < rows.length) {
                                e.preventDefault()
                                dialog.setCurrentPitch(rows[next].pitch)
                                rerender()
                                listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
                            }
                        }}>
                        {rows.map(r => (
                            <div key={r.pitch} role="row" aria-selected={r.pitch === current} className="customize-kit-row"
                                onClick={() => {
                                    dialog.setCurrentPitch(r.pitch)
                                    rerender()
                                }}>
                                <span className="col-pitch">{r.pitch}</span>
                                <span className="col-note">{r.note}</span>
                                <span className="col-shortcut">{r.shortcut}</span>
                                <span className="col-name">{r.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="customize-kit-settings">
                    <label className="field-row">
                        <span>{tr('Name:')}</span>
                        <input type="text" value={dialog.name()} placeholder={tr('Enter a name to enable pitch editing')}
                            onChange={(e) => {
                                dialog.setName(e.target.value)
                                scoreChanged(false)
                                rerender()
                            }} />
                    </label>
                    <label className="field-row">
                        <span>{tr('Notehead group:')}</span>
                        <select value={dialog.noteHead()} disabled={!enabled || custom}
                            onChange={(e) => changed(() => dialog.setNoteHead(Number(e.target.value) as NoteHeadGroup))}>
                            {!NOTE_HEAD_NAMES.includes(dialog.noteHead()) && <option value={dialog.noteHead()} />}
                            {NOTE_HEAD_NAMES.map(g => <option key={g} value={g}>{CustomizeKitDialog.noteHeadName(g)}</option>)}
                        </select>
                    </label>
                    <fieldset className="groupbox" disabled={!enabled}>
                        <legend>
                            <label className="check">
                                <input type="checkbox" checked={custom} onChange={(e) => changed(() => dialog.setCustomGroup(e.target.checked))} />
                                {tr('Edit noteheads')}
                            </label>
                        </legend>
                        {noteheadCombo(NoteHeadType.HEAD_QUARTER, tr('Quarter note'), 2)}
                        {noteheadCombo(NoteHeadType.HEAD_HALF, tr('Half note'), 1)}
                        {noteheadCombo(NoteHeadType.HEAD_WHOLE, tr('Whole note'), 0)}
                        {noteheadCombo(NoteHeadType.HEAD_BREVIS, tr('Double whole note'), 3)}
                    </fieldset>
                    <div className="customize-kit-bottom">
                        <Example dialog={dialog} version={version} />
                        <div className={`customize-kit-form${enabled ? '' : ' disabled'}`}>
                            <label className="field-row">
                                <span>{tr('Default voice:')}</span>
                                <select value={dialog.voice()} disabled={!enabled}
                                    onChange={(e) => changed(() => dialog.setVoice(Number(e.target.value)))}>
                                    {[0, 1, 2, 3].map(v => <option key={v} value={v}>{v + 1}</option>)}
                                </select>
                            </label>
                            <label className="field-row">
                                <span>{tr('Staff line:')}</span>
                                <input type="number" min={-12} max={99} value={dialog.staffLine()} disabled={!enabled}
                                    onChange={(e) => {
                                        if (e.target.value !== '') {
                                            changed(() => dialog.setStaffLine(Number(e.target.value)))
                                        }
                                    }} />
                            </label>
                            <div className="field-row">
                                <span>{tr('Shortcut:')}</span>
                                <button type="button" className="secondary shortcut" disabled={!enabled}
                                    onClick={() => setShortcutOpen(true)}>
                                    {dialog.shortcut() ? formatShortcut(dialog.shortcut()) : qtrc('shortcuts', 'None')}
                                </button>
                            </div>
                            <label className="field-row">
                                <span>{tr('Stem direction:')}</span>
                                <select value={dialog.stemDirection()} disabled={!enabled}
                                    onChange={(e) => changed(() => dialog.setStemDirection(Number(e.target.value) as DirectionV))}>
                                    <option value={DirectionV.AUTO}>{tr('Auto')}</option>
                                    <option value={DirectionV.UP}>{tr('Up')}</option>
                                    <option value={DirectionV.DOWN}>{tr('Down')}</option>
                                </select>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            <div className="dialog-buttons">
                <button type="button" className="secondary" onClick={() => void (async () => {
                    // load(): a .drm file; an older file only after a warning
                    const file = await pickFile(drmType())
                    if (!file) {
                        return
                    }
                    const xml = await file.text()
                    let result = dialog.load(xml)
                    if (result === 'tooOld') {
                        const button = await showMessage(qtrc('palette', 'Drumset file too old'),
                            qtrc('palette', 'MuseScore Studio may not be able to load this drumset file.'), ['cancel', 'ignore'])
                        if (button !== 'ignore') {
                            return
                        }
                        result = dialog.load(xml, true)
                    }
                    rerender()
                })()}>{tr('Load…')}</button>
                <button type="button" className="secondary" onClick={() => void (async () => {
                    const xml = dialog.save()
                    scoreChanged(false)
                    try {
                        await saveToComputer(new TextEncoder().encode(xml), 'drumset.drm', drmType())
                    } catch (e) {
                        await showMessage(qtrc('palette', 'Write drumset'), arg(qtrc('palette', 'Writing file failed: %1'), String(e)))
                    }
                })()}>{tr('Save as…')}</button>
                <span className="spacer" />
                <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                <button type="button" className="secondary" onClick={() => changed(() => dialog.apply())}>{qtrc('global', 'Apply')}</button>
                <button type="button" className="primary" onClick={() => {
                    done.current = true
                    dialog.apply()
                    scoreChanged(false)
                    ref.current?.close()
                }}>{qtrc('global', 'OK')}</button>
            </div>
            {shortcutOpen && (
                <ShortcutDialog title={dialog.name()} origin={dialog.shortcut()} drums={dialog.drumsWithShortcut()}
                    onClose={(result) => {
                        setShortcutOpen(false)
                        if (result) {
                            changed(() => dialog.setShortcut(result.shortcut, result.conflictDrumPitch))
                        }
                    }} />
            )}
        </dialog>
    )
}

let s_open: { key: number; dialog: CustomizeKitDialog } | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setOpen(v: typeof s_open): void {
    s_open = v
    for (const l of listeners) {
        l()
    }
}

/** the "customize-kit" action is possible for the score (a drum staff in the context or the note input) */
export function canCustomizeKit(score: Score | null): boolean {
    return !!score && libCanCustomizeKit(score)
}

/** PaletteActionsController::openCustomizeKitDialog */
export function openCustomizeKitDialog(): void {
    const score = currentScore()
    const dialog = score ? createCustomizeKitDialog(score) : null
    if (dialog) {
        setOpen({ key: ++s_key, dialog })
    }
}

export function CustomizeKitDialogHost(): React.JSX.Element | null {
    const open = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_open)
    return open ? <CustomizeKit key={open.key} dialog={open.dialog} onClose={() => setOpen(null)} /> : null
}
