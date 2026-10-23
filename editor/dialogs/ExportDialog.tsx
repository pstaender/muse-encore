/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's Export dialog (project/qml/MuseScore/Project/ExportDialog.qml with ExportScoresListView,
 * ExportOptionsView and the settings pages of the formats; File > Export…). The model is the library's
 * ExportDialogModel; the settings of the formats are kept in the app settings. The files are saved like "Save to
 * computer" (the browser's save dialog or a download); several files are saved as one ZIP archive (MuseScore writes
 * them into the chosen folder). The browser cannot open the destination folder: no "Open destination folder" option.
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import { zipSync } from 'fflate'
import {
    createExportDialogModel, MusicXmlLayoutType, UnitType, type ExportDialogModel, type ExportedFile, type Score,
} from '../../src/index'
import { saveToComputer, baseName, type FilePickerType } from '../files'
import { qtrc, useLanguage } from '../i18n'
import { currentScore } from '../scoreview'
import { session } from '../session'
import { settings, updateSettings } from '../settings'
import './export.css'

const tr = (s: string): string => qtrc('project/export', s)

const MIME_TYPES: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', svg: 'image/svg+xml', mid: 'audio/midi', midi: 'audio/midi', kar: 'audio/midi',
    mxl: 'application/vnd.recordare.musicxml', musicxml: 'application/vnd.recordare.musicxml+xml', xml: 'application/xml',
    mscz: 'application/x-musescore', mscx: 'application/x-musescore+xml', zip: 'application/zip',
}

function fileType(name: string, description: string): FilePickerType {
    const suffix = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    return { description, accept: { [MIME_TYPES[suffix] ?? 'application/octet-stream']: [`.${suffix}`] } }
}

/** saves the exported files: one file as it is, several as a ZIP archive named after the dialog's default file name */
async function saveFiles(files: ExportedFile[], defaultName: string, description: string): Promise<boolean> {
    if (files.length === 1) {
        return !!(await saveToComputer(files[0].data, files[0].fileName, fileType(files[0].fileName, description)))
    }
    const zip = zipSync(Object.fromEntries(files.map(f => [f.fileName, [f.data, { level: 0 }]])))
    const zipName = `${defaultName.replace(/\.[^.]*$/, '')}.zip`
    return !!(await saveToComputer(zip, zipName, fileType(zipName, 'ZIP')))
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
    return (
        <label className="export-check">
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
            <span>{label}</span>
        </label>
    )
}

function Resolution({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }): React.JSX.Element {
    const [text, setText] = useState(String(value))
    const commit = (): void => {
        const v = Math.round(Number(text))
        const clamped = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : value
        setText(String(clamped))
        onChange(clamped)
    }
    return (
        <div className="export-option">
            <label htmlFor="export-resolution">{tr('Resolution:')}</label>
            <span className="export-spinbox">
                <input id="export-resolution" type="number" min={min} max={max} step={1} value={text}
                    onChange={e => setText(e.target.value)} onBlur={commit}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            commit()
                        }
                    }} />
                <span className="unit">{qtrc('global', 'dpi')}</span>
            </span>
        </div>
    )
}

/** the settings page of the selected format (PdfSettingsPage.qml, PngSettingsPage.qml, ...) */
function SettingsPage({ model, page, changed }: { model: ExportDialogModel; page: string; changed: () => void }): React.JSX.Element | null {
    const set = (fn: () => void): void => {
        fn()
        changed()
    }
    const separateFiles = (format: string): React.JSX.Element => (
        <p className="export-info">{tr('Each page of the selected parts will be exported as a separate %1 file.').replace('%1', format)}</p>
    )
    switch (page) {
    case 'PdfSettingsPage':
        return (
            <>
                <Resolution value={model.pdfResolution()} min={72} max={2400} onChange={v => set(() => model.setPdfResolution(v))} />
                <Check label={tr('Transparent background')} checked={model.pdfTransparentBackground()}
                    onChange={v => set(() => model.setPdfTransparentBackground(v))} />
                <Check label={tr('Grayscale')} checked={model.pdfGrayscale()} onChange={v => set(() => model.setPdfGrayscale(v))} />
            </>
        )
    case 'PngSettingsPage':
        return (
            <>
                <Resolution value={model.pngResolution()} min={32} max={5000} onChange={v => set(() => model.setPngResolution(v))} />
                <Check label={tr('Transparent background')} checked={model.pngTransparentBackground()}
                    onChange={v => set(() => model.setPngTransparentBackground(v))} />
                <Check label={tr('Grayscale')} checked={model.pngGrayscale()} onChange={v => set(() => model.setPngGrayscale(v))} />
                {separateFiles('PNG')}
            </>
        )
    case 'SvgSettingsPage':
        return (
            <>
                <Check label={tr('Transparent background')} checked={model.svgTransparentBackground()}
                    onChange={v => set(() => model.setSvgTransparentBackground(v))} />
                <Check label={tr('Masking compatibility (Adobe Illustrator only)')} checked={model.svgIllustratorCompat()}
                    onChange={v => set(() => model.setSvgIllustratorCompat(v))} />
                {separateFiles('SVG')}
            </>
        )
    case 'MidiSettingsPage':
        return (
            <>
                <Check label={tr('Expand repeats')} checked={model.midiExpandRepeats()} onChange={v => set(() => model.setMidiExpandRepeats(v))} />
                <Check label={tr('Export RPNs')} checked={model.midiExportRpns()} onChange={v => set(() => model.setMidiExportRpns(v))} />
                <p className="export-info">{tr('Each selected part will be exported as a separate MIDI file.')}</p>
            </>
        )
    case 'MusicXmlSettingsPage':
        return (
            <div className="export-radios" role="radiogroup">
                {model.musicXmlLayoutTypes().map(t => (
                    <label key={t.value} className="export-check">
                        <input type="radio" name="musicxml-layout" checked={model.musicXmlLayoutType() === t.value}
                            onChange={() => set(() => model.setMusicXmlLayoutType(t.value as MusicXmlLayoutType))} />
                        <span>{t.text}</span>
                    </label>
                ))}
            </div>
        )
    default:
        return null
    }
}

function ExportDialog({ score, onClose }: { score: Score; onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const [model] = useState(() => {
        // the dialog changes the settings object; it is stored when a setting changed
        const configuration = structuredClone(settings().export)
        const m = createExportDialogModel(score, configuration, baseName(session().current?.name ?? 'Untitled score'),
            () => updateSettings('export', structuredClone(configuration)))
        m.init()
        return m
    })
    const [, rerender] = useReducer((n: number) => n + 1, 0)
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    const type = model.selectedExportType()
    const topLevel = model.selectedTopLevelType()
    const unitTypes = model.availableUnitTypes()

    const doExport = async (): Promise<void> => {
        setError('')
        setProgress({ current: 0, total: 0 })
        // the progress must be painted before the (synchronous) writing of the first file
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)))
        try {
            const defaultName = model.defaultFileName()
            const files = await model.exportScores((current, total) => setProgress({ current, total }))
            setProgress(null)
            if (files.length && await saveFiles(files, defaultName, type.filterName)) {
                ref.current?.close()
            }
        } catch (e) {
            console.error(e)
            setProgress(null)
            setError((e as Error).message)
        }
    }

    return (
        <dialog ref={ref} className="export-dialog" aria-labelledby="export-dialog-title"
            onCancel={(e) => {
                if (progress) {
                    e.preventDefault()
                }
            }}
            onClose={(e) => {
                if (e.target === e.currentTarget) {
                    model.updateExportInfo()
                    onClose()
                }
            }}>
            <h2 id="export-dialog-title" className="visually-hidden">{tr('Export')}</h2>
            <div className="export-columns">
                <div className="export-column">
                    <div className="export-heading">{tr('Select parts to export')}</div>
                    <div className="export-scores" role="list">
                        {model.items().map((item, i) => (
                            <label key={i} className={'export-score' + (item.isMain ? ' main' : '')} role="listitem">
                                <input type="checkbox" checked={item.isSelected} disabled={!!progress}
                                    onChange={(e) => {
                                        model.setSelected(i, e.target.checked)
                                        rerender()
                                    }} />
                                <span>{item.isMain ? tr('Main score') : item.title}</span>
                            </label>
                        ))}
                    </div>
                    <div className="export-buttons">
                        <button type="button" className="secondary" disabled={!!progress}
                            onClick={() => { model.setAllSelected(true); rerender() }}>{tr('Select all')}</button>
                        <button type="button" className="secondary" disabled={!!progress}
                            onClick={() => { model.setAllSelected(false); rerender() }}>{tr('Clear selection')}</button>
                    </div>
                </div>
                <div className="export-column">
                    <div className="export-heading">{tr('Export settings')}</div>
                    <fieldset className="export-options" disabled={!!progress}>
                        <div className="export-option">
                            <label htmlFor="export-format">{tr('Format:')}</label>
                            <select id="export-format" value={topLevel.id}
                                onChange={(e) => {
                                    model.selectExportTypeById(e.target.value)
                                    rerender()
                                }}>
                                {model.exportTypeList().map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                        {topLevel.subtypes.length > 0 && (
                            <div className="export-option">
                                <label htmlFor="export-subtype">{tr('File type:')}</label>
                                <select id="export-subtype" value={type.id}
                                    onChange={(e) => {
                                        model.selectExportTypeById(e.target.value)
                                        rerender()
                                    }}>
                                    {topLevel.subtypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                        )}
                        <SettingsPage model={model} page={type.settingsPage} changed={rerender} />
                        {unitTypes.length > 1 && (
                            <div className="export-radios" role="radiogroup">
                                {unitTypes.map(u => (
                                    <label key={u.value} className="export-check">
                                        <input type="radio" name="export-unit-type" checked={model.selectedUnitType() === u.value}
                                            onChange={() => {
                                                model.setUnitType(u.value as UnitType)
                                                rerender()
                                            }} />
                                        <span>{u.text}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </fieldset>
                    {progress && (
                        <div className="export-progress" role="status">
                            <span>{tr('Exporting…')}</span>
                            <progress max={progress.total || 1} value={progress.total ? progress.current : undefined} />
                        </div>
                    )}
                    {error && <p className="export-error" role="alert">{error}</p>}
                    <div className="dialog-buttons">
                        <button type="button" className="secondary" disabled={!!progress}
                            onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                        <button type="button" className="primary" disabled={model.selectionLength() === 0 || !!progress}
                            onClick={() => void doExport()}>{tr('Export…')}</button>
                    </div>
                </div>
            </div>
        </dialog>
    )
}

let s_open: { key: number; score: Score } | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setOpen(v: typeof s_open): void {
    s_open = v
    for (const l of listeners) {
        l()
    }
}

/** ProjectActionsController::exportScore: the Export dialog for the current notation */
export function openExportDialog(): void {
    const score = currentScore()
    if (score) {
        setOpen({ key: ++s_key, score })
    }
}

export function ExportDialogHost(): React.JSX.Element | null {
    const [, update] = useReducer((n: number) => n + 1, 0)
    useEffect(() => {
        listeners.add(update)
        return () => { listeners.delete(update) }
    }, [])
    return s_open ? <ExportDialog key={s_open.key} score={s_open.score} onClose={() => setOpen(null)} /> : null
}
