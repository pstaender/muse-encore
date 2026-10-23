/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's Page Settings dialog (notationscene/widgets/pagesettings.ui/.cpp, action "page-settings"): the logic is
 * the library's PageSettings; every change is applied to the score at once (one undo command, reverted by Cancel).
 */
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import {
    PageSettings, createPageSettings, type Score, type PageSettingsSpinBox,
} from '../../src/index'
import { qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'
import { settings, updateSettings } from '../settings'

const tr = (s: string): string => qtrc('PageSettingsBase', s)

function formatNumber(v: number, decimals: number): string {
    return v.toFixed(decimals)
}

/** QDoubleSpinBox: commits on Enter, blur and the arrows (a typed value after a short pause, like keyboard tracking) */
function DoubleSpinBox({ name, ps, label, onChanged }: {
    name: PageSettingsSpinBox; ps: PageSettings; label: string; onChanged: () => void
}): React.JSX.Element {
    const sb = ps.values().spinBoxes[name]
    const suffix = ps.values().unitSuffix === 'mm' ? qtrc('global', 'mm') : qtrc('global', 'in', 'abbreviation of inch')
    const shown = formatNumber(sb.value, sb.decimals)
    const [text, setText] = useState(shown)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => setText(shown), [shown])
    useEffect(() => () => clearTimeout(timer.current), [])

    const commit = (t: string): void => {
        clearTimeout(timer.current)
        const v = parseFloat(t.replace(',', '.'))
        if (Number.isFinite(v)) {
            ps.spinBoxChanged(name, v)
            onChanged()
            setText(formatNumber(ps.values().spinBoxes[name].value, sb.decimals))
        } else {
            setText(shown)
        }
    }
    const step = (dir: number): void => commit(formatNumber(sb.value + dir * sb.singleStep, sb.decimals))

    return (
        <span className={`page-spin${sb.enabled ? '' : ' disabled'}`}>
            <input type="text" inputMode="decimal" value={text} aria-label={label} disabled={!sb.enabled} data-name={name}
                onChange={(e) => {
                    setText(e.target.value)
                    clearTimeout(timer.current)
                    const value = e.target.value
                    timer.current = setTimeout(() => commit(value), 600)
                }}
                onBlur={(e) => e.target.value !== shown && commit(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault() // PageSettings::keyPressEvent: Enter does not close the dialog
                        commit(text)
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault()
                        step(e.key === 'ArrowUp' ? 1 : -1)
                    } else if (e.key === 'Escape') {
                        setText(shown)
                    }
                }} />
            <span className="page-spin-suffix">{suffix}</span>
        </span>
    )
}

function PageSettingsDialog({ score, onClose }: { score: Score; onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const accepted = useRef(false)
    const [ps] = useState(() => createPageSettings(score, settings().ui.metricUnit, mm => updateSettings('ui', { metricUnit: mm })))
    const [, rerender] = useReducer((n: number) => n + 1, 0)
    const [pageSizes] = useState(() => PageSettings.pageSizes())

    useEffect(() => {
        ps.show()
        rerender()
        ref.current?.showModal()
    }, [ps])

    const changed = (): void => {
        scoreChanged(false)
        rerender()
    }
    const v = ps.values()
    const spin = (name: PageSettingsSpinBox, label: string): React.JSX.Element =>
        <DoubleSpinBox name={name} ps={ps} label={label} onChanged={changed} />
    const margins = (prefix: 'odd' | 'even', title: string): React.JSX.Element => (
        <fieldset className="groupbox">
            <legend>{tr(title)}</legend>
            <div className="page-margins">
                <span className="top">{spin(`${prefix}PageTopMargin`, tr('Top'))}</span>
                <span className="left">{spin(`${prefix}PageLeftMargin`, tr('Left'))}</span>
                <span className="right">{spin(`${prefix}PageRightMargin`, tr('Right'))}</span>
                <span className="bottom">{spin(`${prefix}PageBottomMargin`, tr('Bottom'))}</span>
            </div>
        </fieldset>
    )

    return (
        <dialog ref={ref} className="page-settings" aria-labelledby="page-settings-title"
            onClose={(e) => {
                if (e.target !== e.currentTarget) {
                    return
                }
                if (!accepted.current) {
                    ps.reject()
                    scoreChanged(false)
                }
                onClose()
            }}>
            <h2 id="page-settings-title">{tr('Page settings')}</h2>
            <form onSubmit={(e) => {
                e.preventDefault()
                accepted.current = true
                ps.accept()
                scoreChanged(false)
                ref.current?.close()
            }}>
                <div className="page-settings-columns">
                    <div className="page-settings-column">
                        <fieldset className="groupbox">
                            <legend>{tr('Page size')}</legend>
                            <select value={v.pageGroup} aria-label={tr('Page size')}
                                onChange={(e) => {
                                    ps.pageFormatSelected(Number(e.target.value))
                                    changed()
                                }}>
                                {pageSizes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <label className="field-row"><span>{tr('Width:')}</span>{spin('pageWidth', tr('Width:'))}</label>
                            <label className="field-row"><span>{tr('Height:')}</span>{spin('pageHeight', tr('Height:'))}</label>
                            <div className="radio-row">
                                <label className="check">
                                    <input type="radio" name="orientation" checked={v.portrait}
                                        onChange={() => {
                                            ps.orientationClicked()
                                            changed()
                                        }} />
                                    {tr('Portrait')}
                                </label>
                                <label className="check">
                                    <input type="radio" name="orientation" checked={v.landscape}
                                        onChange={() => {
                                            ps.orientationClicked()
                                            changed()
                                        }} />
                                    {tr('Landscape')}
                                </label>
                            </div>
                            <label className="check">
                                <input type="checkbox" checked={v.twosided}
                                    onChange={(e) => {
                                        ps.twosidedToggled(e.target.checked)
                                        changed()
                                    }} />
                                {tr('Two sided')}
                            </label>
                        </fieldset>
                        <fieldset className="groupbox">
                            <legend>{tr('Scaling')}</legend>
                            <label className="field-row" title={tr('Distance between two lines on a standard 5-line staff')}>
                                <span>{tr('Staff space (sp):')}</span>{spin('spatiumEntry', tr('Staff space (sp):'))}
                            </label>
                        </fieldset>
                        <fieldset className="groupbox">
                            <legend>{tr('Unit')}</legend>
                            <div className="radio-row">
                                <label className="check">
                                    <input type="radio" name="unit" checked={!v.mmUnit}
                                        onChange={() => {
                                            ps.inchClicked()
                                            rerender()
                                        }} />
                                    {tr('Inch (in)')}
                                </label>
                                <label className="check">
                                    <input type="radio" name="unit" checked={v.mmUnit}
                                        onChange={() => {
                                            ps.mmClicked()
                                            rerender()
                                        }} />
                                    {tr('Millimeter (mm)')}
                                </label>
                            </div>
                        </fieldset>
                    </div>
                    <div className="page-settings-column">
                        {margins('odd', 'Odd page margins')}
                        {margins('even', 'Even page margins')}
                        <label className="field-row">
                            <span>{tr('First page number:')}</span>
                            <input type="number" className="page-offset" min={-999999} max={999999} step={1} value={v.pageOffsetEntry}
                                onChange={(e) => {
                                    const n = Math.round(Number(e.target.value))
                                    if (Number.isFinite(n) && e.target.value !== '') {
                                        ps.pageOffsetChanged(n)
                                        changed()
                                    }
                                }} />
                        </label>
                    </div>
                </div>
                <div className="dialog-buttons">
                    <button type="button" className="secondary"
                        onClick={() => {
                            ps.resetPageStyle()
                            changed()
                        }}>{tr('Reset all page settings to default')}</button>
                    <span className="spacer" />
                    {ps.canApplyToAllParts() && (
                        <button type="button" className="secondary"
                            onClick={() => {
                                ps.applyToAllParts()
                                changed()
                            }}>{tr('Apply to all parts')}</button>
                    )}
                    <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                    <button type="submit" className="primary">{qtrc('global', 'OK')}</button>
                </div>
            </form>
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

/** NotationActionController::openPageSettingsDialog */
export function openPageSettingsDialog(): void {
    const score = currentScore()
    if (score) {
        setOpen({ key: ++s_key, score })
    }
}

export function PageSettingsDialogHost(): React.JSX.Element | null {
    const open = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_open)
    return open ? <PageSettingsDialog key={open.key} score={open.score} onClose={() => setOpen(null)} /> : null
}
