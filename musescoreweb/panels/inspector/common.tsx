/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The common controls of the Properties panel (src/inspector/qml/MuseScore/Inspector/common and the framework's
 * UiComponents): InspectorPropertyView with its reset button, PropertyCheckBox, SpinBoxPropertyView,
 * DropdownPropertyView, FlatRadioButtonGroupPropertyView, ColorSection, OffsetSection, PlacementSection,
 * DirectionSection, InspectorTabBar, the "Show more" expandable and PopupViewButton.
 * A control edits a property item of a model (InspectorPropertyRef); changes go through the edit bridge.
 */
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import {
    inspectorPropertyChanges, inspectorPropertyResets, type InspectorModelInfo, type InspectorPropertyInfo,
    type InspectorPropertyRef, type InspectorValue, type MasterScore,
} from '../../../src/index'
import { ICON_CODES } from '../../actions/uiactiondata'
import { qtrc } from '../../i18n'
import { applyInspectorChanges, scoreChanged } from '../editbridge'

export const icon = (name: string): string => ICON_CODES[name] ? String.fromCodePoint(ICON_CODES[name]) : ''

// ---------------------------------------------------------------------------------
//   the model a control belongs to
// ---------------------------------------------------------------------------------

export interface InspectorContextValue {
    score: MasterScore | null
    /** false while the score cannot be changed (no editing yet): the controls show the values, disabled */
    canEdit: boolean
}

export const InspectorContext = createContext<InspectorContextValue>({ score: null, canEdit: false })

/** a model with the path to it (for the property refs) */
export interface ModelRef {
    model: InspectorModelInfo
    section: string
    path: readonly string[]
}

export function subModel(m: ModelRef | null, key: string): ModelRef | null {
    const model = m?.model.models.find(x => x.key === key)
    return m && model ? { model, section: m.section, path: [...m.path, key] } : null
}

/** the property item `name` of a model, with its setter and reset */
export interface PropertyHandle {
    info: InspectorPropertyInfo
    ref: InspectorPropertyRef
}

export function prop(m: ModelRef | null, name: string): PropertyHandle | null {
    const info = m?.model.properties[name]
    return m && info ? { info, ref: { section: m.section, path: m.path, property: name } } : null
}

export function flag<T>(m: ModelRef | null, name: string, def: T): T {
    const v = m?.model.flags[name]
    return v === undefined ? def : v as T
}

function useEdit(): { set: (p: PropertyHandle, v: InspectorValue) => void; reset: (p: PropertyHandle) => void; canEdit: boolean } {
    const ctx = useContext(InspectorContext)
    return {
        canEdit: ctx.canEdit,
        set: (p, v) => {
            if (ctx.score && applyInspectorChanges(ctx.score, inspectorPropertyChanges(ctx.score, p.ref, v))) {
                scoreChanged()
            }
        },
        reset: (p) => {
            if (ctx.score && applyInspectorChanges(ctx.score, inspectorPropertyResets(ctx.score, p.ref))) {
                scoreChanged()
            }
        },
    }
}

// ---------------------------------------------------------------------------------
//   InspectorPropertyView: title, reset button, the control
// ---------------------------------------------------------------------------------

/** PropertyResetButton (the menu of styled properties: TODO(port) "Save as default style for this score") */
function ResetButton({ p }: { p: PropertyHandle }): React.JSX.Element {
    const { reset, canEdit } = useEdit()
    const title = qtrc('inspector', 'Reset property to default value')
    return (
        <button type="button" className="insp-reset" title={title} aria-label={title}
            disabled={!canEdit || !p.info.isModified} onClick={() => reset(p)}>
            {icon('UNDO')}
        </button>
    )
}

export function PropertyView({ p, title, children, showReset = true, className = '', id }: {
    p: PropertyHandle | null
    title: string
    children: React.ReactNode
    showReset?: boolean
    className?: string
    id?: string
}): React.JSX.Element | null {
    if (!p || !p.info.isVisible) {
        return null
    }
    return (
        <div className={`insp-property${p.info.isEnabled ? '' : ' disabled'} ${className}`} data-property={p.ref.property}>
            {title ? (
                <div className="insp-property-title">
                    <label htmlFor={id}>{title}</label>
                    {showReset && <ResetButton p={p} />}
                </div>
            ) : (
                // no title: the reset button beside the control
                <div className="insp-row insp-untitled">
                    {children}
                    {showReset && <ResetButton p={p} />}
                </div>
            )}
            {title && children}
        </div>
    )
}

// ---------------------------------------------------------------------------------
//   controls
// ---------------------------------------------------------------------------------

/** PropertyCheckBox (indeterminate when undefined) */
export function PropertyCheckBox({ p, text, invert = false }: { p: PropertyHandle | null; text: string; invert?: boolean }): React.JSX.Element | null {
    const { set, canEdit } = useEdit()
    const ref = useRef<HTMLInputElement>(null)
    const undef = !!p && p.info.isEnabled && p.info.isUndefined
    useEffect(() => {
        if (ref.current) {
            ref.current.indeterminate = undef
        }
    })
    if (!p || !p.info.isVisible) {
        return null
    }
    const checked = !undef && !!p.info.value !== invert
    return (
        <label className={`insp-checkbox${p.info.isEnabled ? '' : ' disabled'}`} data-property={p.ref.property}>
            <input ref={ref} type="checkbox" checked={checked} disabled={!canEdit || !p.info.isEnabled}
                onChange={(e) => set(p, e.target.checked !== invert)} />
            <span>{text}</span>
        </label>
    )
}

/** a plain checkbox for an action state (the score display checkboxes) */
export function ActionCheckBox({ text, checked, enabled, onChange, title }: {
    text: string; checked: boolean; enabled: boolean; onChange: () => void; title?: string
}): React.JSX.Element {
    return (
        <label className={`insp-checkbox${enabled ? '' : ' disabled'}`} title={title}>
            <input type="checkbox" checked={checked} disabled={!enabled} onChange={onChange} />
            <span>{text}</span>
        </label>
    )
}

function formatNumber(v: number, decimals: number): string {
    return Number.isFinite(v) ? String(Number(v.toFixed(decimals))) : ''
}

/** IncrementalPropertyControl: a number with its unit; arrows step */
export function SpinBox({ p, value, decimals = 2, step = 0.5, min = -999, max = 999, unit = '', label, onCommit, id }: {
    p: PropertyHandle
    value: InspectorValue | null
    decimals?: number
    step?: number
    min?: number
    max?: number
    unit?: string
    label: string
    onCommit: (v: number) => void
    id?: string
}): React.JSX.Element {
    const { canEdit } = useEdit()
    const shown = value === null || value === undefined ? '' : formatNumber(Number(value), decimals)
    const [text, setText] = useState(shown)
    useEffect(() => setText(shown), [shown])
    const commit = (t: string): void => {
        const v = parseFloat(t.replace(',', '.'))
        if (Number.isFinite(v)) {
            onCommit(Math.min(max, Math.max(min, v)))
        } else {
            setText(shown)
        }
    }
    return (
        <div className={`insp-spinbox${!canEdit || !p.info.isEnabled ? ' disabled' : ''}`}>
            <input id={id} type="text" inputMode="decimal" value={text} aria-label={label} placeholder={value === null ? '--' : ''}
                disabled={!canEdit || !p.info.isEnabled}
                onChange={(e) => setText(e.target.value)}
                onBlur={(e) => e.target.value !== shown && commit(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        commit(text)
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault()
                        const v = (Number.isFinite(parseFloat(text)) ? parseFloat(text) : 0) + (e.key === 'ArrowUp' ? step : -step)
                        commit(formatNumber(v, decimals))
                    } else if (e.key === 'Escape') {
                        setText(shown)
                    }
                }} />
            {unit && <span className="insp-unit">{unit}</span>}
        </div>
    )
}

/** SpinBoxPropertyView */
export function SpinBoxPropertyView({ p, title, unit, decimals, step, min, max, half = false, transform }: {
    p: PropertyHandle | null
    title: string
    unit?: string
    decimals?: number
    step?: number
    min?: number
    max?: number
    half?: boolean
    /** the value shown for the item's value and back */
    transform?: [(v: number) => number, (v: number) => number]
}): React.JSX.Element | null {
    const { set } = useEdit()
    const id = useId()
    if (!p) {
        return null
    }
    const value = p.info.value === null ? null : transform ? transform[0](Number(p.info.value)) : p.info.value
    return (
        <PropertyView p={p} title={title} className={half ? 'half' : ''} id={id}>
            <SpinBox p={p} id={id} value={value} unit={unit} decimals={decimals} step={step} min={min} max={max} label={title}
                onCommit={(v) => set(p, transform ? transform[1](v) : v)} />
        </PropertyView>
    )
}

export interface Option {
    value: number | boolean | string
    text?: string
    /** IconCode name */
    icon?: string
    title?: string
}

/** DropdownPropertyView */
export function DropdownPropertyView({ p, title, options }: { p: PropertyHandle | null; title: string; options: readonly Option[] }): React.JSX.Element | null {
    const { set, canEdit } = useEdit()
    const id = useId()
    if (!p) {
        return null
    }
    const idx = p.info.isUndefined ? -1 : options.findIndex(o => o.value === p.info.value)
    return (
        <PropertyView p={p} title={title} id={id}>
            <select id={id} className="insp-dropdown" value={idx} disabled={!canEdit || !p.info.isEnabled}
                onChange={(e) => {
                    const o = options[Number(e.target.value)]
                    if (o) {
                        set(p, o.value)
                    }
                }}>
                {idx < 0 && <option value={-1}>--</option>}
                {options.map((o, i) => <option key={i} value={i}>{o.text ?? o.title ?? String(o.value)}</option>)}
            </select>
        </PropertyView>
    )
}

/** FlatRadioButtonGroupPropertyView's buttons (RadioButtonGroup of FlatRadioButtons): icon or text */
export function RadioButtons({ p, options, label, value, onSelect }: {
    p: PropertyHandle
    options: readonly Option[]
    label: string
    value?: InspectorValue | null
    onSelect?: (v: Option['value']) => void
}): React.JSX.Element {
    const { set, canEdit } = useEdit()
    const current = value !== undefined ? value : p.info.isUndefined ? null : p.info.value
    const disabled = !canEdit || !p.info.isEnabled
    const buttons = useRef<(HTMLButtonElement | null)[]>([])
    const selected = options.findIndex(o => o.value === current)
    return (
        <div className="insp-radio-group" role="radiogroup" aria-label={label}
            onKeyDown={(e) => {
                const i = buttons.current.indexOf(document.activeElement as HTMLButtonElement)
                const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
                if (d && i >= 0) {
                    e.preventDefault()
                    buttons.current[(i + d + options.length) % options.length]?.focus()
                }
            }}>
            {options.map((o, i) => (
                <button key={i} ref={el => { buttons.current[i] = el }} type="button" role="radio" aria-checked={o.value === current}
                    tabIndex={i === (selected < 0 ? 0 : selected) ? 0 : -1}
                    className={`insp-radio${o.icon ? ' insp-icon' : ''}`} title={o.title ?? o.text} aria-label={o.title ?? o.text}
                    disabled={disabled} onClick={() => onSelect ? onSelect(o.value) : set(p, o.value)}>
                    {o.icon ? icon(o.icon) : o.text}
                </button>
            ))}
        </div>
    )
}

export function FlatRadioButtonGroupPropertyView({ p, title, options }: { p: PropertyHandle | null; title: string; options: readonly Option[] }): React.JSX.Element | null {
    if (!p) {
        return null
    }
    return (
        <PropertyView p={p} title={title}>
            <RadioButtons p={p} options={options} label={title} />
        </PropertyView>
    )
}

/** ColorSection (ColorPicker) */
export function ColorSection({ p, title = qtrc('inspector', 'Color') }: { p: PropertyHandle | null; title?: string }): React.JSX.Element | null {
    const { set, canEdit } = useEdit()
    const id = useId()
    if (!p) {
        return null
    }
    const v = typeof p.info.value === 'string' ? p.info.value : ''
    // "#aarrggbb" -> "#rrggbb" for the input
    const rgb = v.length === 9 ? `#${v.slice(3)}` : v || '#000000'
    return (
        <PropertyView p={p} title={title} id={id}>
            <input id={id} type="color" className="insp-color" value={rgb} disabled={!canEdit || !p.info.isEnabled}
                aria-label={title} onChange={(e) => set(p, e.target.value)} />
        </PropertyView>
    )
}

/** OffsetSection: horizontal and vertical offset in sp (or mm) */
export function OffsetSection({ p, title = qtrc('inspector', 'Offset'), units = 'sp', verticalAvailable = true }: {
    p: PropertyHandle | null
    title?: string
    units?: string
    verticalAvailable?: boolean
}): React.JSX.Element | null {
    const { set } = useEdit()
    if (!p) {
        return null
    }
    const v = p.info.value as { x: number; y: number } | null
    const unit = units === 'mm' ? qtrc('global', 'mm') : units === 'sp' ? qtrc('global', 'sp') : ''
    const hTitle = qtrc('inspector', 'Horizontal')
    const vTitle = qtrc('inspector', 'Vertical')
    return (
        <PropertyView p={p} title={title}>
            <div className="insp-row">
                <SpinBox p={p} value={v ? v.x : null} unit={unit} step={0.5} label={`${title} ${hTitle}`}
                    onCommit={(x) => set(p, { x, y: v?.y ?? 0 })} />
                {verticalAvailable && (
                    <SpinBox p={p} value={v ? v.y : null} unit={unit} step={0.5} label={`${title} ${vTitle}`}
                        onCommit={(y) => set(p, { x: v?.x ?? 0, y })} />
                )}
            </div>
        </PropertyView>
    )
}

/** PlacementSection (above/below) */
export function PlacementSection({ p, title = qtrc('inspector', 'Position'), options }: {
    p: PropertyHandle | null; title?: string; options?: readonly Option[]
}): React.JSX.Element | null {
    return <FlatRadioButtonGroupPropertyView p={p} title={title} options={options ?? [
        { text: qtrc('inspector', 'Above'), value: 0 /* PlacementV::ABOVE */ },
        { text: qtrc('inspector', 'Below'), value: 1 /* PlacementV::BELOW */ },
    ]} />
}

/** DirectionSection (vertical: auto/down/up, horizontal: auto/left/right) */
export function DirectionSection({ p, title = qtrc('inspector', 'Direction'), horizontal = false }: {
    p: PropertyHandle | null; title?: string; horizontal?: boolean
}): React.JSX.Element | null {
    const options: Option[] = horizontal ? [
        { text: qtrc('inspector', 'Auto'), value: 0, title: qtrc('inspector', 'Auto', 'direction') },
        { icon: 'ARROW_LEFT', value: 1, title: qtrc('inspector', 'Left', 'direction') },
        { icon: 'ARROW_RIGHT', value: 2, title: qtrc('inspector', 'Right', 'direction') },
    ] : [
        { text: qtrc('inspector', 'Auto'), value: 0, title: qtrc('inspector', 'Auto', 'direction') },
        { icon: 'ARROW_DOWN', value: 2 /* DirectionV::DOWN */, title: qtrc('inspector', 'Down', 'direction') },
        { icon: 'ARROW_UP', value: 1 /* DirectionV::UP */, title: qtrc('inspector', 'Up', 'direction') },
    ]
    return <FlatRadioButtonGroupPropertyView p={p} title={title} options={options} />
}

/** InspectorTabBar with InspectorTabButtons */
export function TabBar({ tabs, current, onChange, label }: {
    tabs: readonly { key: string; title: string; hidden?: boolean }[]
    current: string
    onChange: (key: string) => void
    label: string
}): React.JSX.Element {
    const shown = tabs.filter(t => !t.hidden)
    return (
        <div className="insp-tabbar" role="tablist" aria-label={label}
            onKeyDown={(e) => {
                const i = shown.findIndex(t => t.key === current)
                const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
                if (d && i >= 0) {
                    e.preventDefault()
                    const next = shown[(i + d + shown.length) % shown.length]
                    onChange(next.key)
                    requestAnimationFrame(() => (e.currentTarget.querySelector(`[data-tab="${next.key}"]`) as HTMLElement | null)?.focus())
                }
            }}>
            {shown.map(t => (
                <button key={t.key} type="button" role="tab" data-tab={t.key} aria-selected={t.key === current}
                    tabIndex={t.key === current ? 0 : -1} onClick={() => onChange(t.key)}>
                    {t.title}
                </button>
            ))}
        </div>
    )
}

/** the "Show more" / "Show less" expandable of the settings views */
export function ShowMore({ children }: { children: React.ReactNode }): React.JSX.Element {
    const [expanded, setExpanded] = useState(false)
    return (
        <div className="insp-showmore">
            <button type="button" className="insp-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                <span className="insp-arrow" aria-hidden="true">{icon('SMALL_ARROW_DOWN')}</span>
                {expanded ? qtrc('inspector', 'Show less') : qtrc('inspector', 'Show more')}
            </button>
            {expanded && <div className="insp-column">{children}</div>}
        </div>
    )
}

/** PopupViewButton: a button opening its content in a popup below it (Escape or a click outside closes it) */
export function PopupViewButton({ text, iconName, enabled = true, children }: {
    text: string; iconName: string; enabled?: boolean; children: React.ReactNode
}): React.JSX.Element {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!open) {
            return
        }
        const close = (e: Event): void => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('pointerdown', close)
        return () => document.removeEventListener('pointerdown', close)
    }, [open])
    return (
        <div ref={ref} className="insp-popup-button" onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
                e.stopPropagation()
                setOpen(false)
                ;(ref.current?.querySelector('.insp-flat-button') as HTMLElement | null)?.focus()
            }
        }}>
            <button type="button" className="insp-flat-button" aria-expanded={open} aria-haspopup="dialog" disabled={!enabled}
                onClick={() => setOpen(!open)}>
                <span className="insp-button-icon" aria-hidden="true">{icon(iconName)}</span>
                {text}
            </button>
            {open && <div className="insp-popup" role="dialog" aria-label={text}>{children}</div>}
        </div>
    )
}

/** FlatButton */
export function FlatButton({ text, iconName, onClick, enabled = true, title, accent = false }: {
    text: string; iconName?: string; onClick: () => void; enabled?: boolean; title?: string; accent?: boolean
}): React.JSX.Element {
    return (
        <button type="button" className={`insp-flat-button${accent ? ' accent' : ''}`} disabled={!enabled} title={title} onClick={onClick}>
            {iconName && <span className="insp-button-icon" aria-hidden="true">{icon(iconName)}</span>}
            {text}
        </button>
    )
}

export function Separator(): React.JSX.Element {
    return <div className="insp-separator" role="separator" />
}
