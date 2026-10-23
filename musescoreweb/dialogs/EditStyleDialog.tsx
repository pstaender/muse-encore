/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's Style dialog (notationscene/widgets/editstyle.ui/.cpp, the action "edit-style"): the page list and the
 * pages of editstyle.ui rendered from the generated widget tree (PAGE_LIST, PAGE_STACK) with the widget states of the
 * library's EditStyle; the QML parts of the dialog (createQmlWidget) are the components of editstyle/qmlpages.tsx,
 * appended to the layout of their host widget. Every change is applied to the score immediately (one undo step on OK,
 * rolled back on Cancel).
 */
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import {
    Align, AlignH, AlignV, Color, FontStyle, PAGE_LIST, PAGE_STACK, PointF, createEditStyle, notationStyle, uiText,
    type EditStyle, type Score, type UiLayout, type UiWidget, type WidgetState,
} from '../../src/index'
import { ICON_CODES } from '../actions/uiactiondata'
import { qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'
import { QML_WIDGETS } from './editstyle/qmlpages'
import './editstyle/editstyle.css'

const icon = (code: number): string => String.fromCodePoint(code)

interface Ctx {
    es: EditStyle
    score: Score
    goToTextStylePage: (codeOrIndex: string | number) => void
}

// ---------------------------------------------------------------------------------
//   widgets
// ---------------------------------------------------------------------------------

/** QSpinBox / QDoubleSpinBox (keyboardTracking off: typed values are applied on Enter or when leaving the field) */
function SpinBox({ name, st, disabled, suffix, title, onCommit }: {
    name: string; st: Pick<WidgetState, 'value' | 'minimum' | 'maximum' | 'singleStep' | 'decimals'>; disabled: boolean
    suffix?: string; title?: string; onCommit: (v: number) => void
}): React.JSX.Element {
    const [text, setText] = useState<string | null>(null)
    const commit = (s: string): void => {
        const n = Number(s.replace(',', '.'))
        if (s.trim() !== '' && Number.isFinite(n)) {
            onCommit(n)
        }
        setText(null)
    }
    const shown = text ?? st.value.toFixed(st.decimals)
    return (
        <span className="es-spin">
            <input type="number" data-name={name} value={shown} min={st.minimum} max={st.maximum} step={st.singleStep}
                disabled={disabled} title={title} aria-label={title ?? name}
                onChange={(e) => {
                    if (!(e.nativeEvent as InputEvent).inputType) {
                        // the arrows of the field or the mouse wheel
                        commit(e.target.value)
                    } else {
                        setText(e.target.value)
                    }
                }}
                onBlur={() => text !== null && commit(text)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        if (text !== null) {
                            commit(text)
                        }
                    } else if (e.key === 'Escape' && text !== null) {
                        e.stopPropagation()
                        setText(null)
                    }
                }} />
            {suffix && <span className="es-suffix">{suffix}</span>}
        </span>
    )
}

function ResetButton({ es, name, st, disabled, title }: { es: EditStyle; name: string; st: WidgetState; disabled: boolean; title: string }): React.JSX.Element {
    return (
        <button type="button" className="es-reset" data-name={name} disabled={disabled} title={title} aria-label={title}
            onClick={() => es.click(name)}>
            {st.ui.n === 'buttonTogglePagelist' ? '' : icon(ICON_CODES.UNDO)}
        </button>
    )
}

/** mu::notation::OffsetSelect (offset_select.ui: -999 ... 999.99, step 0.5) */
function OffsetSelect({ es, name, st, disabled }: { es: EditStyle; name: string; st: WidgetState; disabled: boolean }): React.JSX.Element {
    const tr = (s: string): string => qtrc('OffsetSelect', s)
    const suffix = st.suffix ?? tr('sp')
    const axis = (label: string, title: string, value: number, make: (v: number) => PointF): React.JSX.Element => (
        <label className="es-offset-axis">
            <span>{tr(label)}</span>
            <SpinBox name={`${name}.${label[0].toLowerCase()}`} st={{ value, minimum: -999, maximum: 999.99, singleStep: 0.5, decimals: 2 }}
                disabled={disabled} suffix={suffix} title={tr(title)}
                onCommit={v => es.setOffset(name, make(Math.round(Math.max(-999, Math.min(999.99, v)) * 100) / 100))} />
        </label>
    )
    return (
        <span className="es-offset" data-name={name}>
            {axis('X:', 'Horizontal offset', st.offset.x(), v => new PointF(v, st.offset.y()))}
            {axis('Y:', 'Vertical offset', st.offset.y(), v => new PointF(st.offset.x(), v))}
        </span>
    )
}

/** mu::notation::AlignSelect (align_select.ui) */
function AlignSelect({ es, name, st, disabled }: { es: EditStyle; name: string; st: WidgetState; disabled: boolean }): React.JSX.Element {
    const tr = (s: string): string => qtrc('AlignSelect', s)
    const button = (checked: boolean, code: number, title: string, onClick: () => void): React.JSX.Element => (
        <button type="button" className={`es-toggle${checked ? ' checked' : ''}`} aria-pressed={checked} disabled={disabled}
            title={tr(title)} aria-label={tr(title)} onClick={onClick}>{icon(code)}</button>
    )
    const a = st.align
    const setH = (h: AlignH): void => es.setAlign(name, new Align(h, a.vertical))
    const setV = (v: AlignV): void => es.setAlign(name, new Align(a.horizontal, v))
    return (
        <span className="es-align" data-name={name}>
            <span className="es-button-row">
                {button(a.horizontal === AlignH.LEFT, ICON_CODES.TEXT_ALIGN_LEFT, 'Left-align text within its bounding box', () => setH(AlignH.LEFT))}
                {button(a.horizontal === AlignH.HCENTER, ICON_CODES.TEXT_ALIGN_CENTER, 'Horizontally center text within its bounding box', () => setH(AlignH.HCENTER))}
                {button(a.horizontal === AlignH.RIGHT, ICON_CODES.TEXT_ALIGN_RIGHT, 'Right-align text within its bounding box', () => setH(AlignH.RIGHT))}
                {button(a.horizontal === AlignH.JUSTIFY, ICON_CODES.TEXT_ALIGN_JUSTIFY, 'Justify text to fill the available width', () => setH(AlignH.JUSTIFY))}
                <span className="es-gap" />
                {button(st.position === AlignH.LEFT, ICON_CODES.ALIGN_LEFT, 'Left-align text box to reference point', () => es.setPosition(name, AlignH.LEFT))}
                {button(st.position === AlignH.HCENTER, ICON_CODES.ALIGN_HORIZONTAL_CENTER, 'Horizontally center text box to reference point', () => es.setPosition(name, AlignH.HCENTER))}
                {button(st.position === AlignH.RIGHT, ICON_CODES.ALIGN_RIGHT, 'Right-align text box to reference point', () => es.setPosition(name, AlignH.RIGHT))}
            </span>
            <span className="es-button-row">
                {button(a.vertical === AlignV.TOP, ICON_CODES.TEXT_ALIGN_TOP, 'Align top edge of text to reference point', () => setV(AlignV.TOP))}
                {button(a.vertical === AlignV.VCENTER, ICON_CODES.TEXT_ALIGN_MIDDLE, 'Center text vertical to reference point', () => setV(AlignV.VCENTER))}
                {button(a.vertical === AlignV.BOTTOM, ICON_CODES.TEXT_ALIGN_BOTTOM, 'Align bottom edge of text to reference point', () => setV(AlignV.BOTTOM))}
                {button(a.vertical === AlignV.BASELINE, ICON_CODES.TEXT_ALIGN_BASELINE, 'Align baseline of text to reference point', () => setV(AlignV.BASELINE))}
            </span>
        </span>
    )
}

/** mu::notation::FontStyleSelect (font_style_select.ui) */
function FontStyleSelect({ es, name, st, disabled }: { es: EditStyle; name: string; st: WidgetState; disabled: boolean }): React.JSX.Element {
    const tr = (s: string): string => qtrc('FontStyleSelect', s)
    const fs = st.fontStyle === FontStyle.Undefined ? FontStyle.Normal : st.fontStyle
    const button = (flag: FontStyle, code: number, title: string): React.JSX.Element => {
        const checked = (fs & flag) !== 0
        return (
            <button type="button" className={`es-toggle${checked ? ' checked' : ''}`} aria-pressed={checked} disabled={disabled}
                title={tr(title)} aria-label={tr(title)} onClick={() => es.setFontStyle(name, (checked ? fs & ~flag : fs | flag) as FontStyle)}>
                {icon(code)}
            </button>
        )
    }
    return (
        <span className="es-button-row" data-name={name}>
            {button(FontStyle.Bold, ICON_CODES.TEXT_BOLD, 'Bold')}
            {button(FontStyle.Italic, ICON_CODES.TEXT_ITALIC, 'Italic')}
            {button(FontStyle.Underline, ICON_CODES.TEXT_UNDERLINE, 'Underline')}
            {button(FontStyle.Strike, ICON_CODES.TEXT_STRIKE, 'Strike')}
        </span>
    )
}

const hex2 = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')

/** Awl::ColorLabel */
function ColorLabel({ es, name, st, disabled }: { es: EditStyle; name: string; st: WidgetState; disabled: boolean }): React.JSX.Element {
    const c = st.color
    return (
        <input type="color" className="es-color" data-name={name} disabled={disabled} aria-label={name}
            value={`#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`}
            onChange={(e) => {
                const v = e.target.value
                es.setColor(name, new Color(parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), c.a))
            }} />
    )
}

// ---------------------------------------------------------------------------------
//   the widget tree
// ---------------------------------------------------------------------------------

function QmlHost({ ctx, name }: { ctx: Ctx; name: string }): React.JSX.Element | null {
    const Page = QML_WIDGETS[name]
    return Page ? <div className="es-qml"><Page score={ctx.score} style={notationStyle(ctx.score)} goToTextStylePage={ctx.goToTextStylePage} /></div> : null
}

function LayoutView({ ctx, layout, disabled }: { ctx: Ctx; layout: UiLayout; disabled: boolean }): React.JSX.Element {
    const grid = layout.c === 'QGridLayout' || layout.c === 'QFormLayout'
    const cls = grid ? 'es-grid' : layout.c === 'QHBoxLayout' ? 'es-hbox' : 'es-vbox'
    return (
        <div className={cls}>
            {layout.i.map((it, i) => {
                const style: React.CSSProperties = grid
                    ? { gridRow: `${(it.r ?? 0) + 1} / span ${it.rs ?? 1}`, gridColumn: `${(it.col ?? 0) + 1} / span ${it.cs ?? 1}` }
                    : {}
                if (it.s) {
                    return <div key={i} className={`es-spacer ${it.s}`} style={style} />
                }
                if (it.l) {
                    return <div key={i} className="es-cell" style={style}><LayoutView ctx={ctx} layout={it.l} disabled={disabled} /></div>
                }
                if (it.w) {
                    if (!ctx.es.widget(it.w.n).visible) {
                        return null
                    }
                    return <div key={i} className={`es-cell es-cell-${it.w.c}`} style={style}><WidgetView ctx={ctx} w={it.w} disabled={disabled} /></div>
                }
                return null
            })}
        </div>
    )
}

function Contents({ ctx, w, disabled }: { ctx: Ctx; w: UiWidget; disabled: boolean }): React.JSX.Element {
    return (
        <>
            {w.l && <LayoutView ctx={ctx} layout={w.l} disabled={disabled} />}
            {(w.w ?? []).map(c => ctx.es.widget(c.n).visible && <WidgetView key={c.n} ctx={ctx} w={c} disabled={disabled} />)}
            <QmlHost ctx={ctx} name={w.n} />
        </>
    )
}

function WidgetView({ ctx, w, disabled: parentDisabled }: { ctx: Ctx; w: UiWidget; disabled: boolean }): React.JSX.Element | null {
    const { es } = ctx
    const name = w.n
    const st = es.widget(name)
    if (!st.visible) {
        return null
    }
    const disabled = parentDisabled || !st.enabled
    const p = w.p ?? {}
    const title = p.toolTip ? uiText(p.toolTip) : undefined
    const text = st.text ?? uiText(p.text)

    switch (w.c) {
    case 'QLabel':
        if (name === 'headerFooterMacroInfo') {
            return <div className="es-label es-rich" data-name={name} dangerouslySetInnerHTML={{ __html: es.headerFooterMacroInfoText() }} />
        }
        if (p.textFormat === 'RichText' || /^\s*<(html|p|b|qt)\b/i.test(text)) {
            return <div className={`es-label es-rich${disabled ? ' disabled' : ''}`} data-name={name} title={title} dangerouslySetInnerHTML={{ __html: text }} />
        }
        return <span className={`es-label${disabled ? ' disabled' : ''}${p.wordWrap ? ' wrap' : ''}`} data-name={name} title={title}>{text}</span>
    case 'QCheckBox':
    case 'QRadioButton':
        return (
            <label className={`es-check${disabled ? ' disabled' : ''}`} title={title}>
                <input type={w.c === 'QCheckBox' ? 'checkbox' : 'radio'} data-name={name} checked={st.checked} disabled={disabled}
                    onChange={e => es.click(name, e.target.checked)} />
                <span>{text}</span>
            </label>
        )
    case 'QSpinBox':
    case 'QDoubleSpinBox':
        return <SpinBox name={name} st={st} disabled={disabled} suffix={st.suffix ?? (p.suffix ? uiText(p.suffix) : undefined)} title={title}
            onCommit={v => es.setValue(name, v)} />
    case 'QComboBox':
    case 'QFontComboBox':
        return (
            <select data-name={name} value={st.currentIndex} disabled={disabled} title={title} aria-label={title ?? name}
                onChange={e => es.setCurrentIndex(name, Number(e.target.value))}>
                {st.currentIndex < 0 && <option value={-1} />}
                {st.items.map((it, i) => <option key={i} value={i}>{it.text.translated()}</option>)}
            </select>
        )
    case 'QToolButton':
        return <ResetButton es={es} name={name} st={st} disabled={disabled} title={title ?? ''} />
    case 'QPushButton':
        return (
            <button type="button" className="secondary" data-name={name} disabled={disabled} title={title} onClick={() => es.click(name)}>{text}</button>
        )
    case 'QTextEdit':
        return (
            <textarea data-name={name} className="es-textedit" value={st.text ?? ''} disabled={disabled} title={title} aria-label={title ?? name}
                rows={2} onChange={e => es.setText(name, e.target.value)} />
        )
    case 'QLineEdit':
        return (
            <input type="text" data-name={name} value={st.text ?? ''} disabled={disabled} title={title} aria-label={title ?? name}
                onChange={e => es.setText(name, e.target.value)} onBlur={() => es.editingFinished(name)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        es.editingFinished(name)
                    }
                }} />
        )
    case 'QListWidget':
        return (
            <div className="es-list" role="listbox" data-name={name} aria-label={name}>
                {st.items.map((it, i) => (
                    <div key={i} role="option" aria-selected={i === st.currentIndex} className={i === st.currentIndex ? 'selected' : ''}
                        onClick={() => es.setCurrentIndex(name, i)}>{it.text.translated()}</div>
                ))}
            </div>
        )
    case 'Line':
        return <hr className={`es-line ${p.orientation === 'v' ? 'v' : 'h'}`} />
    case 'OffsetSelect':
        return <OffsetSelect es={es} name={name} st={st} disabled={disabled} />
    case 'AlignSelect':
        return <AlignSelect es={es} name={name} st={st} disabled={disabled} />
    case 'FontStyleSelect':
        return <FontStyleSelect es={es} name={name} st={st} disabled={disabled} />
    case 'ColorLabel':
        return <ColorLabel es={es} name={name} st={st} disabled={disabled} />
    case 'QGroupBox':
    case 'RadioButtonGroupBox': {
        const checkable = !!p.checkable
        const childrenDisabled = disabled || checkable && !st.checked
        return (
            <fieldset className={`es-group${p.flat ? ' flat' : ''}`} data-name={name}>
                {(p.title || checkable) && (
                    <legend>
                        {checkable ? (
                            <label className={`es-check${disabled ? ' disabled' : ''}`}>
                                <input type={w.c === 'RadioButtonGroupBox' ? 'radio' : 'checkbox'} data-name={name} checked={st.checked}
                                    disabled={disabled} onChange={e => es.click(name, e.target.checked)}
                                    onClick={(e) => {
                                        // a checked radio group box is unchecked by clicking it (it is not exclusive)
                                        if (w.c === 'RadioButtonGroupBox' && st.checked) {
                                            e.preventDefault()
                                            es.click(name, false)
                                        }
                                    }} />
                                <span>{uiText(p.title)}</span>
                            </label>
                        ) : uiText(p.title)}
                    </legend>
                )}
                <Contents ctx={ctx} w={w} disabled={childrenDisabled} />
            </fieldset>
        )
    }
    case 'QScrollArea':
        return <div className="es-scroll" data-name={name}><Contents ctx={ctx} w={w} disabled={disabled} /></div>
    case 'QSplitter':
        return <div className={`es-splitter ${p.orientation === 'v' ? 'v' : 'h'}`} data-name={name}><Contents ctx={ctx} w={w} disabled={disabled} /></div>
    default:
        // QWidget, QFrame, pages
        return <div className={`es-widget${p.minW ? ' min-w' : ''}`} data-name={name}><Contents ctx={ctx} w={w} disabled={disabled} /></div>
    }
}

// ---------------------------------------------------------------------------------
//   the dialog
// ---------------------------------------------------------------------------------

function EditStyleDialog({ score, pageCode, subPageCode, onClose }: {
    score: Score; pageCode?: string; subPageCode?: string; onClose: () => void
}): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const [es] = useState(() => createEditStyle(score))
    const [, rerender] = useReducer((x: number) => x + 1, 0)
    const closed = useRef(false)
    const tr = (s: string): string => qtrc('EditStyleBase', s)

    useEffect(() => {
        es.show()
        if (pageCode) {
            es.setCurrentPageCode(pageCode)
            if (subPageCode) {
                es.setCurrentSubPageCode(subPageCode)
            }
        }
        rerender()
        let frame = 0
        const off = es.onChanged(() => {
            rerender()
            // the score is laid out with each style change; the view is redrawn once per frame
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => scoreChanged(false))
        })
        const styleChanged = notationStyle(score).styleChanged()
        const offStyle = styleChanged.onNotify(() => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => scoreChanged(false))
        })
        ref.current?.showModal()
        return () => {
            off()
            offStyle()
            cancelAnimationFrame(frame)
        }
    }, [es, score, pageCode, subPageCode])

    const close = (ok: boolean): void => {
        if (closed.current) {
            return
        }
        closed.current = true
        if (ok) {
            es.accept()
        } else {
            es.reject()
        }
        scoreChanged(false)
        ref.current?.close()
        onClose()
    }

    const ctx: Ctx = { es, score, goToTextStylePage: (c) => es.goToTextStylePage(c) }
    const pageIndex = es.currentPageIndex()
    const page = PAGE_STACK.w?.[pageIndex]

    return (
        <dialog ref={ref} className="edit-style" aria-labelledby="edit-style-title"
            onCancel={(e) => {
                e.preventDefault()
                close(false)
            }}
            onKeyDown={(e) => {
                // EditStyle::keyPressEvent: Enter does not close the dialog
                if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
                    e.preventDefault()
                }
            }}>
            <h2 id="edit-style-title">{tr('Style')}</h2>
            <div className="es-main">
                {es.pageListVisible() && (
                    <div className="es-pagelist" role="listbox" aria-label={tr('Style')}>
                        {(PAGE_LIST.i ?? []).map((t, i) => (
                            <div key={i} role="option" aria-selected={i === pageIndex} className={i === pageIndex ? 'selected' : ''}
                                onClick={() => es.setCurrentIndex('pageList', i)}>{uiText(t)}</div>
                        ))}
                    </div>
                )}
                <div className="es-page" key={pageIndex}>
                    {page && <WidgetView ctx={ctx} w={page} disabled={false} />}
                </div>
            </div>
            <div className="dialog-buttons es-buttons">
                <button type="button" className="secondary es-toggle-pagelist" aria-label="toggle page list"
                    onClick={() => es.on_buttonTogglePagelist_clicked()}>
                    {icon(es.pageListVisible() ? ICON_CODES.ARROW_RIGHT : ICON_CODES.ARROW_LEFT)}
                </button>
                <button type="button" className="secondary" onClick={() => es.click('resetStylesButton')}>{tr('Reset all styles to default')}</button>
                <span className="spacer" />
                {es.canApplyToAllParts() && (
                    <button type="button" className="secondary" onClick={() => es.applyToAllParts()}>
                        {qtrc('notation/editstyle', 'Apply to all parts')}
                    </button>
                )}
                <button type="button" className="secondary" onClick={() => close(false)}>{qtrc('global', 'Cancel')}</button>
                <button type="button" className="primary" onClick={() => close(true)}>{qtrc('global', 'OK')}</button>
            </div>
        </dialog>
    )
}

let s_open: { key: number; score: Score; pageCode?: string; subPageCode?: string } | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setOpen(v: typeof s_open): void {
    s_open = v
    for (const l of listeners) {
        l()
    }
}

/** NotationActionController::openEditStyleDialog (the arguments: the page code and the sub page code) */
export function openEditStyleDialog(pageCode?: string, subPageCode?: string): void {
    const score = currentScore()
    if (score && !s_open) {
        setOpen({ key: ++s_key, score, pageCode, subPageCode })
    }
}

export function EditStyleDialogHost(): React.JSX.Element | null {
    const open = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_open)
    return open
        ? <EditStyleDialog key={open.key} score={open.score} pageCode={open.pageCode} subPageCode={open.subPageCode} onClose={() => setOpen(null)} />
        : null
}
