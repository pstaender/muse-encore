/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's "Edit staff type" dialog (notationscene/widgets/editstafftype.ui/.cpp, "Advanced style properties…" of
 * the Staff/Part properties): lines, line distance, clef/time signature/barlines and the page of the staff group
 * (pitched: key signature, ledger lines, stemless, notehead scheme; percussion; tablature: fret marks, note values),
 * the template ("Reset to template") and the preview (the first system of MuseScore's std_sample.mscx /
 * tab_sample.mscx with the staff type). The logic is the library's EditStaffType.
 * TODO(port): "Edit text style" (the Style dialog), "Add to templates" (hidden in MuseScore)
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
    EditStaffType, NOTEHEAD_SCHEMES, StaffGroup, TablatureMinimStyle, TablatureSymbolRepeat, drawPage, layoutScore, loadScore,
    systemRect, type EditStaffTypeValues, type MasterScore, type TabNoteValues, type NoteHeadScheme, type TextStyleType,
} from '../../src/index'
import { qtrc, useLanguage } from '../i18n'

const samples = import.meta.glob<string>('../../MuseScore/src/notationscene/widgets/resources/*_sample.mscx',
    { query: '?raw', import: 'default' })

const s_previews = new Map<string, Promise<MasterScore>>()

/** the sample score of the preview (loaded once) */
function previewScore(name: 'std' | 'tab'): Promise<MasterScore> {
    let p = s_previews.get(name)
    if (!p) {
        const load = samples[`../../MuseScore/src/notationscene/widgets/resources/${name}_sample.mscx`]
        p = load().then(text => {
            const score = loadScore(new TextEncoder().encode(text))
            layoutScore(score)
            return score
        })
        s_previews.set(name, p)
    }
    return p
}

const tr = (s: string, disambiguation?: string): string => qtrc('EditStaffType', s, disambiguation)

/** ExampleView: the first system of the preview score */
function Preview({ model, values }: { model: EditStaffType; values: EditStaffTypeValues }): React.JSX.Element {
    const canvas = useRef<HTMLCanvasElement>(null)
    const kind = values.group === StaffGroup.TAB ? 'tab' : 'std'
    useEffect(() => {
        let cancelled = false
        void previewScore(kind).then(score => {
            const c = canvas.current
            if (cancelled || !c) {
                return
            }
            model.updatePreview(score)
            const r = systemRect(score)
            if (!r) {
                return
            }
            const margin = 0.1
            const cssWidth = c.clientWidth || 400
            const dpi = cssWidth / (r.width + 2 * margin)
            const dpr = window.devicePixelRatio || 1
            const cssHeight = (r.height + 2 * margin) * dpi
            c.width = Math.round(cssWidth * dpr)
            c.height = Math.round(cssHeight * dpr)
            c.style.height = `${cssHeight}px`
            const ctx = c.getContext('2d')!
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, c.width, c.height)
            drawPage(score, 0, ctx, {
                dpi: dpi * dpr,
                background: false,
                region: {
                    x: (r.x - margin) * dpi * dpr, y: (r.y - margin) * dpi * dpr,
                    width: c.width, height: c.height,
                },
            })
        })
        return () => { cancelled = true }
    }, [model, values, kind])
    return (
        <fieldset className="groupbox preview">
            <legend>{tr('Preview')}</legend>
            <canvas ref={canvas} className="staff-type-preview" />
        </fieldset>
    )
}

export function EditStaffTypeDialog({ model, onClose }: { model: EditStaffType; onClose: (accepted: boolean) => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const [values, setValuesState] = useState(() => model.values())
    const [template, setTemplate] = useState(-1)
    const accepted = useRef(false)
    const textStyles = useMemo(() => model.textStyleNames(), [model])

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    const set = (patch: Partial<EditStaffTypeValues>): void => {
        model.set(patch)
        setValuesState(model.values())
    }
    const enabled = model.enabled()

    const check = (label: string, key: keyof EditStaffTypeValues, disabled = false): React.JSX.Element => (
        <label className="check">
            <input type="checkbox" checked={values[key] as boolean} disabled={disabled}
                onChange={e => set({ [key]: e.target.checked } as Partial<EditStaffTypeValues>)} />
            {tr(label)}
        </label>
    )
    function radio<T>(name: string, label: string, value: T, current: T, onChange: (v: T) => void, disabled = false,
        disambiguation?: string): React.JSX.Element {
        return (
            <label className="check">
                <input type="radio" name={name} checked={current === value} disabled={disabled} onChange={() => onChange(value)} />
                {tr(label, disambiguation)}
            </label>
        )
    }
    const number = (label: string, key: keyof EditStaffTypeValues, opts: { min: number; max: number; step: number; suffix?: string }): React.JSX.Element => (
        <label className="field-row">
            <span>{tr(label)}</span>
            <span className="spin">
                <input type="number" min={opts.min} max={opts.max} step={opts.step} value={values[key] as number}
                    onChange={e => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n)) {
                            set({ [key]: Math.max(opts.min, Math.min(opts.max, n)) } as Partial<EditStaffTypeValues>)
                        }
                    }} />
                {opts.suffix && <span className="suffix">{tr(opts.suffix)}</span>}
            </span>
        </label>
    )

    const groupTitle = values.group === StaffGroup.TAB ? 'TABLATURE STAFF'
        : values.group === StaffGroup.PERCUSSION ? 'PERCUSSION STAFF' : 'STANDARD STAFF'

    return (
        <dialog ref={ref} className="edit-staff-type" aria-labelledby="edit-staff-type-title" onClose={(e) => {
            if (e.target === e.currentTarget) {
                onClose(accepted.current)
            }
        }}>
            <h2 id="edit-staff-type-title">{tr('Edit staff type')}</h2>
            <div className="staff-type-body">
                <div className="staff-type-header">
                    <strong className="group-name">{tr(groupTitle)}</strong>
                    <input type="text" readOnly value={values.name} aria-label={values.name} />
                </div>
                <div className="staff-type-common">
                    {number('Lines:', 'lines', { min: 1, max: 14, step: 1 })}
                    {number('Line distance:', 'lineDistance', { min: 0, max: 99, step: 0.25, suffix: 'sp' })}
                    {check('Show clef', 'genClef')}
                    {check('Show time signature', 'genTimesig')}
                    {check('Show barlines', 'showBarlines')}
                </div>

                {values.group === StaffGroup.STANDARD && (
                    <div className="staff-type-page">
                        {check('Show key signature', 'genKeysigPitched')}
                        {check('Show ledger lines', 'showLedgerLinesPitched')}
                        {check('Stemless', 'stemlessPitched')}
                        <label className="field-row">
                            <span>{tr('Notehead scheme:')}</span>
                            <select value={values.noteHeadScheme} onChange={e => set({ noteHeadScheme: Number(e.target.value) as NoteHeadScheme })}>
                                {NOTEHEAD_SCHEMES.map(s => <option key={s} value={s}>{EditStaffType.noteHeadSchemeName(s)}</option>)}
                            </select>
                        </label>
                    </div>
                )}

                {values.group === StaffGroup.PERCUSSION && (
                    <div className="staff-type-page">
                        {check('Show key signature', 'genKeysigPercussion')}
                        {check('Stemless', 'stemlessPercussion')}
                        {check('Show ledger lines', 'showLedgerLinesPercussion')}
                    </div>
                )}

                {values.group === StaffGroup.TAB && (
                    <div className="staff-type-page tab">
                        {check('Upside down', 'upsideDown')}
                        <fieldset className="groupbox">
                            <legend>{tr('Fret marks')}</legend>
                            <div className="radio-row">
                                {radio('fret-marks', 'Text style', true, values.fretUseTextStyle, v => set({ fretUseTextStyle: v }))}
                                {radio('fret-marks', 'Tab font preset', false, values.fretUseTextStyle, v => set({ fretUseTextStyle: v }))}
                            </div>
                            {values.fretUseTextStyle ? (
                                <label className="field-row">
                                    <select value={values.fretTextStyle} aria-label={tr('Text style')}
                                        onChange={e => set({ fretTextStyle: Number(e.target.value) as TextStyleType })}>
                                        {textStyles.map(t => <option key={t.style} value={t.style}>{t.name}</option>)}
                                    </select>
                                    {/* TODO(port): "Edit text style" (the Style dialog, page text-styles / tab-fret-number) */}
                                </label>
                            ) : (
                                <>
                                    <label className="field-row">
                                        <span>{tr('Font:')}</span>
                                        <select value={values.fretFontIdx} onChange={e => set({ fretFontIdx: Number(e.target.value) })}>
                                            {EditStaffType.fretFontNames().map((n, i) => <option key={i} value={i}>{n}</option>)}
                                        </select>
                                    </label>
                                    {number('Size:', 'fretFontSize', { min: 1, max: 99, step: 0.5, suffix: 'pt' })}
                                    {number('Vertical offset:', 'fretY', { min: -99, max: 99, step: 0.1, suffix: 'sp' })}
                                </>
                            )}
                            <div className="radio-grid">
                                <span>{tr('Marks are drawn:')}</span>
                                {radio('on-lines', 'On lines', true, values.onLines, v => set({ onLines: v }))}
                                {radio('on-lines', 'Above lines', false, values.onLines, v => set({ onLines: v }))}
                                <span>{tr('Lines are:')}</span>
                                {radio('lines-through', 'Continuous', true, values.linesThrough, v => set({ linesThrough: v }))}
                                {radio('lines-through', 'Broken', false, values.linesThrough, v => set({ linesThrough: v }))}
                                <span>{tr('Marks are:')}</span>
                                {radio('numbers', 'Numbers', true, values.useNumbers, v => set({ useNumbers: v }))}
                                {radio('numbers', 'Letters', false, values.useNumbers, v => set({ useNumbers: v }))}
                            </div>
                            {check('Show fingering in tablature', 'showTabFingering')}
                        </fieldset>
                        <fieldset className="groupbox">
                            <legend>{tr('Note values')}</legend>
                            <label className="field-row">
                                <span>{tr('Font:')}</span>
                                <select value={values.durFontIdx} onChange={e => set({ durFontIdx: Number(e.target.value) })}>
                                    {EditStaffType.durationFontNames().map((n, i) => <option key={i} value={i}>{n}</option>)}
                                </select>
                            </label>
                            {number('Size:', 'durFontSize', { min: 1, max: 99, step: 0.5, suffix: 'pt' })}
                            {number('Vertical offset:', 'durY', { min: -99, max: 99, step: 0.1, suffix: 'sp' })}
                            <div className="radio-grid">
                                <span>{tr('Shown as:')}</span>
                                {radio<TabNoteValues>('note-values', 'None', 'none', values.noteValues, v => set({ noteValues: v }), false,
                                    'neither note symbols nor stems and beams')}
                                {radio<TabNoteValues>('note-values', 'Note symbols', 'symbols', values.noteValues, v => set({ noteValues: v }))}
                                {radio<TabNoteValues>('note-values', 'Stems and beams', 'stems', values.noteValues, v => set({ noteValues: v }))}
                                <span>{tr('Repeat:')}</span>
                                {radio('repeat', 'Never', TablatureSymbolRepeat.NEVER, values.symRepeat, v => set({ symRepeat: v }), !enabled.valuesRepeat)}
                                {radio('repeat', 'At new system', TablatureSymbolRepeat.SYSTEM, values.symRepeat, v => set({ symRepeat: v }), !enabled.valuesRepeat)}
                                {radio('repeat', 'At new meas.', TablatureSymbolRepeat.MEASURE, values.symRepeat, v => set({ symRepeat: v }), !enabled.valuesRepeat)}
                                {radio('repeat', 'Always', TablatureSymbolRepeat.ALWAYS, values.symRepeat, v => set({ symRepeat: v }), !enabled.valuesRepeat)}
                                <span>{tr('Stem style:')}</span>
                                {radio('stem-style', 'Beside staff', false, values.stemThrough, v => set({ stemThrough: v }), !enabled.stemBeside)}
                                {radio('stem-style', 'Through staff', true, values.stemThrough, v => set({ stemThrough: v }), !enabled.stemThrough)}
                                <span>{tr('Stem position:')}</span>
                                {radio('stem-pos', 'Above', false, values.stemsDown, v => set({ stemsDown: v }), !enabled.stemAboveBelow)}
                                {radio('stem-pos', 'Below', true, values.stemsDown, v => set({ stemsDown: v }), !enabled.stemAboveBelow)}
                                <span>{tr('Half notes:')}</span>
                                {radio('minim', 'None', TablatureMinimStyle.NONE, values.minimStyle, v => set({ minimStyle: v }), !enabled.minimNone,
                                    'neither short nor slashed stem')}
                                {radio('minim', 'As short stem', TablatureMinimStyle.SHORTER, values.minimStyle, v => set({ minimStyle: v }), !enabled.minimShort)}
                                {radio('minim', 'As slashed stem', TablatureMinimStyle.SLASHED, values.minimStyle, v => set({ minimStyle: v }), !enabled.minimSlashed)}
                            </div>
                            {check('Show rests', 'showRests')}
                        </fieldset>
                    </div>
                )}

                {values.group !== StaffGroup.PERCUSSION && <Preview model={model} values={values} />}

                <div className="staff-type-template">
                    <label className="field-row">
                        <span>{tr('Template:')}</span>
                        <select value={template} onChange={e => setTemplate(Number(e.target.value))}>
                            <option value={-1} hidden />
                            {model.templates().map(t => <option key={t.idx} value={t.idx}>{t.name}</option>)}
                        </select>
                    </label>
                    <button type="button" className="secondary" disabled={template < 0} onClick={() => {
                        model.resetToTemplate(template)
                        setValuesState(model.values())
                    }}>{tr('< Reset to template')}</button>
                </div>
            </div>
            <div className="dialog-buttons">
                <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                <button type="button" className="primary" onClick={() => {
                    accepted.current = true
                    ref.current?.close()
                }}>{qtrc('global', 'OK')}</button>
            </div>
        </dialog>
    )
}
