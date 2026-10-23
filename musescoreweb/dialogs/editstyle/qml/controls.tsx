/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The shared controls of the QML pages of MuseScore's Style dialog (styledialog/*.qml: StyleDialogPage, ItemWithTitle,
 * StyleControlRowWithReset, StyleSpinboxWithReset, StyleToggle, StyleToggleWithImage, StyleResetButton,
 * RadioButtonSelectorWithReset, IconAndTextButtonSelector, TextFieldWithReset, StyledXYControllerWithReset,
 * StyledImage, ComboBoxDropdown, LineStyleSection) and of the UiComponents they use (IncrementalPropertyControl,
 * CheckBox, ToggleButton, RoundedRadioButton, FlatRadioButton groups, FlatButton, StyledGroupBox).
 */
import { useEffect, useId, useState } from 'react'
import { PointF, type AbstractStyleDialogModel, type NotationStyle, type StyleItem } from '../../../../src/index'
import { ICON_CODES } from '../../../actions/uiactiondata'
import { qtrc } from '../../../i18n'
import { styleDialogImage } from './images'
import './styledialog.css'

type Value = ReturnType<StyleItem['value']>

export function iconChar(name: string | undefined): string {
    const code = name ? ICON_CODES[name] : undefined
    return code ? String.fromCodePoint(code) : ''
}

/**
 * A page model (QML: `XyzPageModel { id: ... }`) for the life time of the component; the component is rendered again
 * when the style changes.
 */
export function useStyleModel<M extends AbstractStyleDialogModel>(style: NotationStyle, create: (style: NotationStyle) => M): M {
    const [model] = useState(() => create(style))
    const [, setTick] = useState(0)
    useEffect(() => {
        const off = style.styleChanged().onNotify(() => setTick(t => t + 1))
        return () => {
            off()
            model.deinit()
        }
    }, [style, model])
    return model
}

/** re-renders on changes of a model's own notification (e.g. measureNumberPosAboveChanged) */
export function useNotification(n: { onNotify: (l: () => void) => () => void }): void {
    const [, setTick] = useState(0)
    useEffect(() => n.onNotify(() => setTick(t => t + 1)), [n])
}

// ---------------------------------------------------------------------------------
//   layout
// ---------------------------------------------------------------------------------

/** StyleDialogPage: a scrolling column */
export function StyleDialogPage({ children, spacing = 18 }: { children: React.ReactNode; spacing?: number }): React.JSX.Element {
    return <div className="sd-page" style={{ gap: spacing }}>{children}</div>
}

export function Column({ children, spacing = 12, className = '', enabled = true, style }: {
    children: React.ReactNode; spacing?: number; className?: string; enabled?: boolean; style?: React.CSSProperties
}): React.JSX.Element {
    return <div className={`sd-column${enabled ? '' : ' disabled'} ${className}`} style={{ gap: spacing, ...style }}>{children}</div>
}

export function Row({ children, spacing = 8, className = '', enabled = true }: {
    children: React.ReactNode; spacing?: number; className?: string; enabled?: boolean
}): React.JSX.Element {
    return <div className={`sd-row${enabled ? '' : ' disabled'} ${className}`} style={{ gap: spacing }}>{children}</div>
}

/** StyledGroupBox */
export function GroupBox({ title, children, enabled = true, spacing = 12, minWidth }: {
    title?: string; children: React.ReactNode; enabled?: boolean; spacing?: number; minWidth?: number
}): React.JSX.Element {
    return (
        <fieldset className={`sd-groupbox${enabled ? '' : ' disabled'}`} disabled={!enabled} style={{ minWidth }}>
            {title && <legend>{title}</legend>}
            <div className="sd-column" style={{ gap: spacing }}>{children}</div>
        </fieldset>
    )
}

/** ItemWithTitle */
export function ItemWithTitle({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
    return (
        <div className="sd-column" style={{ gap: 8 }}>
            <span className="sd-label">{title}</span>
            {children}
        </div>
    )
}

/** StyledTextLabel */
export function Label({ text, enabled = true, wrap = true, width }: { text: string; enabled?: boolean; wrap?: boolean; width?: number }): React.JSX.Element {
    return <span className={`sd-label${enabled ? '' : ' disabled'}${wrap ? '' : ' nowrap'}`} style={{ width }}>{text}</span>
}

// ---------------------------------------------------------------------------------
//   basic controls
// ---------------------------------------------------------------------------------

function formatNumber(v: number, decimals: number): string {
    return Number.isFinite(v) ? String(Number(v.toFixed(decimals))) : ''
}

/** IncrementalPropertyControl: a number with its unit; arrows (and the buttons) step */
export function SpinBox({ value, onEdited, decimals = 2, step = 0.5, min = -999, max = 999, unit = '', width = 80, prefixIcon,
    enabled = true, label }: {
    value: number
    onEdited: (v: number) => void
    decimals?: number
    step?: number
    min?: number
    max?: number
    unit?: string
    width?: number
    /** IconCode name */
    prefixIcon?: string
    enabled?: boolean
    label?: string
}): React.JSX.Element {
    const shown = formatNumber(Number(value), decimals)
    const [text, setText] = useState(shown)
    useEffect(() => setText(shown), [shown])
    const commit = (t: string): void => {
        const v = parseFloat(t.replace(',', '.'))
        if (Number.isFinite(v)) {
            const clamped = Math.min(max, Math.max(min, v))
            setText(formatNumber(clamped, decimals))
            if (!Number.isFinite(Number(value)) || formatNumber(clamped, decimals) !== shown) {
                onEdited(Number(clamped.toFixed(decimals)))
            }
        } else {
            setText(shown)
        }
    }
    const stepBy = (d: number): void => {
        const v = (Number.isFinite(parseFloat(text)) ? parseFloat(text) : 0) + d
        commit(formatNumber(v, decimals))
    }
    return (
        <div className={`sd-spinbox${enabled ? '' : ' disabled'}`} style={{ width }}>
            {prefixIcon && <span className="sd-icon sd-prefix" aria-hidden="true">{iconChar(prefixIcon)}</span>}
            <input type="text" inputMode="decimal" value={text} aria-label={label} disabled={!enabled}
                onChange={(e) => setText(e.target.value)}
                onBlur={(e) => e.target.value !== shown && commit(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        commit(text)
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault()
                        stepBy(e.key === 'ArrowUp' ? step : -step)
                    } else if (e.key === 'Escape') {
                        e.stopPropagation()
                        setText(shown)
                    }
                }} />
            {unit && <span className="sd-unit">{unit}</span>}
            <span className="sd-steppers">
                <button type="button" tabIndex={-1} disabled={!enabled} aria-label="+" onClick={() => stepBy(step)}>{iconChar('SMALL_ARROW_UP')}</button>
                <button type="button" tabIndex={-1} disabled={!enabled} aria-label="-" onClick={() => stepBy(-step)}>{iconChar('SMALL_ARROW_DOWN')}</button>
            </span>
        </div>
    )
}

/** FlatButton (text and/or icon) */
export function FlatButton({ text, icon, onClick, enabled = true, title, accent = false, small = false }: {
    text?: string; icon?: string; onClick: () => void; enabled?: boolean; title?: string; accent?: boolean; small?: boolean
}): React.JSX.Element {
    return (
        <button type="button" disabled={!enabled}
            className={`sd-flat-button${icon && !text ? ' icon-only' : ''}${accent ? ' accent' : ''}${small ? ' small' : ''}`}
            title={title} aria-label={title ?? text} onClick={onClick}>
            {icon && <span className="sd-icon" aria-hidden="true">{iconChar(icon)}</span>}
            {text}
        </button>
    )
}

/** StyleResetButton */
export function StyleResetButton({ styleItem, enabled, onClicked }: {
    styleItem: StyleItem; enabled?: boolean; onClicked?: () => void
}): React.JSX.Element {
    return (
        <FlatButton icon="UNDO" title={qtrc('global', 'Reset')}
            enabled={enabled ?? !styleItem.isDefault()}
            onClick={onClicked ?? (() => styleItem.modifyValue(styleItem.defaultValue()))} />
    )
}

/** CheckBox */
export function CheckBox({ text, checked, onClicked, enabled = true }: {
    text: string; checked: boolean; onClicked: () => void; enabled?: boolean
}): React.JSX.Element {
    return (
        <label className={`sd-checkbox${enabled ? '' : ' disabled'}`}>
            <input type="checkbox" checked={checked} disabled={!enabled} onChange={onClicked} />
            <span>{text}</span>
        </label>
    )
}

/** ToggleButton (a switch with an optional text) */
export function ToggleButton({ text, checked, onToggled, enabled = true }: {
    text?: string; checked: boolean; onToggled: () => void; enabled?: boolean
}): React.JSX.Element {
    return (
        <label className={`sd-toggle${enabled ? '' : ' disabled'}`}>
            <input type="checkbox" role="switch" checked={checked} disabled={!enabled} onChange={onToggled} />
            <span className="sd-toggle-track" aria-hidden="true" />
            {text && <span>{text}</span>}
        </label>
    )
}

/** StyleToggle */
export function StyleToggle({ styleItem, text }: { styleItem: StyleItem; text?: string }): React.JSX.Element {
    return <ToggleButton text={text} checked={styleItem.value() === true} onToggled={() => styleItem.modifyValue(!styleItem.value())} />
}

/** RoundedRadioButton */
export function RoundedRadioButton({ text, checked, onToggled, enabled = true }: {
    text: string; checked: boolean; onToggled: () => void; enabled?: boolean
}): React.JSX.Element {
    return (
        <label className={`sd-radio${enabled ? '' : ' disabled'}`}>
            <input type="radio" checked={checked} disabled={!enabled} onChange={() => !checked && onToggled()} />
            <span>{text}</span>
        </label>
    )
}

/** a group of RoundedRadioButtons for the values of a style item */
export function RoundedRadioGroup({ styleItem, model, enabled = true, horizontal = false }: {
    styleItem: StyleItem; model: readonly { text: string; value: Value }[]; enabled?: boolean; horizontal?: boolean
}): React.JSX.Element {
    const name = useId()
    return (
        <div className={horizontal ? 'sd-row' : 'sd-column'} style={{ gap: horizontal ? 16 : 8 }} role="radiogroup">
            {model.map((o, i) => (
                <label key={i} className={`sd-radio${enabled ? '' : ' disabled'}`}>
                    <input type="radio" name={name} checked={styleItem.value() === o.value} disabled={!enabled}
                        onChange={() => styleItem.modifyValue(o.value)} />
                    <span>{o.text}</span>
                </label>
            ))}
        </div>
    )
}

export interface FlatRadioOption {
    value: Value
    text?: string
    /** IconCode name */
    iconCode?: string
    title?: string
    iconSize?: number
}

/** RadioButtonGroup of FlatRadioButtons (an icon and/or a text per button) */
export function FlatRadioButtons({ model, value, onToggled, buttonWidth, buttonHeight = 30, iconSize, vertical = false,
    spacing = 4, enabled = true, label }: {
    model: readonly FlatRadioOption[]
    value: Value
    onToggled: (v: Value) => void
    buttonWidth?: number
    buttonHeight?: number
    /** the icon above the text (IconAndTextButtonSelector, page selectors) at this size */
    iconSize?: number
    vertical?: boolean
    spacing?: number
    enabled?: boolean
    label?: string
}): React.JSX.Element {
    return (
        <div className={`sd-flat-radio-group${vertical ? ' vertical' : ''}`} role="radiogroup" aria-label={label} style={{ gap: spacing }}>
            {model.map((o, i) => {
                const checked = o.value === value || (o.value instanceof PointF && value instanceof PointF && o.value.equals(value))
                const stacked = !!o.iconCode && !!o.text
                return (
                    <button key={i} type="button" role="radio" aria-checked={checked} disabled={!enabled}
                        className={`sd-flat-radio${stacked ? ' stacked' : ''}`}
                        style={{ width: buttonWidth, height: buttonHeight, flex: buttonWidth ? 'none' : undefined }}
                        title={o.title ?? o.text} aria-label={o.title ?? o.text}
                        onClick={() => !checked && onToggled(o.value)}>
                        {o.iconCode && <span className="sd-icon" aria-hidden="true"
                            style={{ fontSize: o.iconSize ?? iconSize ?? (stacked ? 28 : 16) }}>{iconChar(o.iconCode)}</span>}
                        {o.text && <span>{o.text}</span>}
                    </button>
                )
            })}
        </div>
    )
}

/** TextInputField (live: onTextEdited, else onTextEditingFinished) */
export function TextField({ value, onEdited, width = 138, enabled = true, label, live = false }: {
    value: string; onEdited: (v: string) => void; width?: number; enabled?: boolean; label?: string; live?: boolean
}): React.JSX.Element {
    const [text, setText] = useState(value)
    useEffect(() => setText(value), [value])
    return (
        <input type="text" className="sd-text" style={{ width }} value={text} disabled={!enabled} aria-label={label}
            onChange={(e) => {
                setText(e.target.value)
                if (live) {
                    onEdited(e.target.value)
                }
            }}
            onBlur={() => text !== value && onEdited(text)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    onEdited(text)
                }
            }} />
    )
}

/** StyledImage */
export function StyledImage({ source, forceWidth = 0, forceHeight = 0, horizontalPadding = 8, verticalPadding = 8, enabled = true }: {
    source: string; forceWidth?: number; forceHeight?: number; horizontalPadding?: number; verticalPadding?: number; enabled?: boolean
}): React.JSX.Element {
    return (
        <div className="sd-image" style={{ padding: `${verticalPadding}px ${horizontalPadding}px` }}>
            <img src={styleDialogImage(source)} alt="" style={{
                width: forceWidth || undefined, height: forceHeight || undefined, opacity: enabled ? 1 : 0.2,
            }} />
        </div>
    )
}

/** ComboBoxDropdown: the values of a style item */
export function ComboBoxDropdown({ styleItem, model, onHandleItem, enabled = true, label }: {
    styleItem: StyleItem
    model: readonly { text: string; value: Value }[]
    onHandleItem?: (value: Value) => void
    enabled?: boolean
    label?: string
}): React.JSX.Element {
    // like QML's indexOfValue, a bool matches the number 0/1 (ChordSymbolsPageModel's options for bool styles)
    const v = styleItem.value()
    const idx = model.findIndex(o => o.value === v || (typeof v === 'boolean' && o.value === Number(v)))
    return (
        <select className="sd-dropdown" value={idx} disabled={!enabled} aria-label={label}
            onChange={(e) => {
                const o = model[Number(e.target.value)]
                if (o) {
                    styleItem.modifyValue(o.value)
                    onHandleItem?.(o.value)
                }
            }}>
            {idx < 0 && <option value={-1} />}
            {model.map((o, i) => <option key={i} value={i}>{o.text}</option>)}
        </select>
    )
}

// ---------------------------------------------------------------------------------
//   the rows with a reset button
// ---------------------------------------------------------------------------------

/** StyleControlRowWithReset */
export function StyleControlRowWithReset({ styleItem, label, labelComponent, labelAreaWidth = 120, controlAreaWidth = 326,
    hasReset = true, resetEnabled, resetOnClicked, children, visible = true, enabled = true }: {
    styleItem: StyleItem
    label?: string
    labelComponent?: React.ReactNode
    /** <= 0: the implicit width */
    labelAreaWidth?: number
    controlAreaWidth?: number
    hasReset?: boolean
    resetEnabled?: boolean
    resetOnClicked?: () => void
    children: React.ReactNode
    visible?: boolean
    enabled?: boolean
}): React.JSX.Element | null {
    if (!visible) {
        return null
    }
    return (
        <div className={`sd-row sd-control-row${enabled ? '' : ' disabled'}`} style={{ gap: 8 }}>
            <div className="sd-row-label" style={{ width: labelAreaWidth > 0 ? labelAreaWidth : undefined }}>
                {labelComponent ?? <span className="sd-label">{label}</span>}
            </div>
            <div className="sd-row-control" style={{ width: controlAreaWidth > 0 ? controlAreaWidth : undefined }}>{children}</div>
            {hasReset && <StyleResetButton styleItem={styleItem} enabled={resetEnabled} onClicked={resetOnClicked} />}
        </div>
    )
}

/** StyleSpinboxWithReset */
export function StyleSpinboxWithReset({ styleItem, label, suffix = '', inPercentage = false, step = 0.01, spinBoxWidth = 80,
    min = 0, max, decimals, labelAreaWidth, controlAreaWidth, visible = true, enabled = true, labelComponent }: {
    styleItem: StyleItem
    label?: string
    labelComponent?: React.ReactNode
    suffix?: string
    inPercentage?: boolean
    step?: number
    spinBoxWidth?: number
    min?: number
    max?: number
    decimals?: number
    labelAreaWidth?: number
    controlAreaWidth?: number
    visible?: boolean
    enabled?: boolean
}): React.JSX.Element | null {
    const v = Number(styleItem.value())
    return (
        <StyleControlRowWithReset styleItem={styleItem} label={label} labelComponent={labelComponent} labelAreaWidth={labelAreaWidth}
            controlAreaWidth={controlAreaWidth} visible={visible} enabled={enabled}>
            <SpinBox width={spinBoxWidth} value={inPercentage ? Math.round(v * 100) : v} min={min}
                max={max ?? (inPercentage ? 999 : 99)} step={inPercentage ? 1 : step} decimals={decimals ?? (inPercentage ? 0 : 2)}
                unit={inPercentage ? '%' : suffix} label={label} enabled={enabled}
                onEdited={(nv) => styleItem.modifyValue(inPercentage ? nv / 100 : nv)} />
        </StyleControlRowWithReset>
    )
}

/** RadioButtonSelectorWithReset */
export function RadioButtonSelectorWithReset({ styleItem, label, model, labelAreaWidth, controlAreaWidth, enabled = true,
    visible = true, buttonHeight = 30 }: {
    styleItem: StyleItem
    label?: string
    model: readonly FlatRadioOption[]
    labelAreaWidth?: number
    controlAreaWidth?: number
    enabled?: boolean
    visible?: boolean
    buttonHeight?: number
}): React.JSX.Element | null {
    return (
        <StyleControlRowWithReset styleItem={styleItem} label={label} labelAreaWidth={labelAreaWidth} controlAreaWidth={controlAreaWidth}
            enabled={enabled} visible={visible}>
            <FlatRadioButtons model={model} value={styleItem.value()} buttonHeight={buttonHeight} enabled={enabled} label={label}
                onToggled={(v) => styleItem.modifyValue(v)} />
        </StyleControlRowWithReset>
    )
}

/** IconAndTextButtonSelector */
export function IconAndTextButtonSelector({ styleItem, label, model, buttonHeight = 70, labelAreaWidth, controlAreaWidth,
    enabled = true, hasReset = true }: {
    styleItem: StyleItem
    label?: string
    model: readonly FlatRadioOption[]
    buttonHeight?: number
    labelAreaWidth?: number
    controlAreaWidth?: number
    enabled?: boolean
    hasReset?: boolean
}): React.JSX.Element | null {
    return (
        <StyleControlRowWithReset styleItem={styleItem} label={label} labelAreaWidth={labelAreaWidth} controlAreaWidth={controlAreaWidth}
            enabled={enabled} hasReset={hasReset}>
            <FlatRadioButtons model={model.map(o => ({ ...o, text: o.text ?? '' }))} value={styleItem.value()} buttonHeight={buttonHeight}
                iconSize={28} enabled={enabled} label={label} onToggled={(v) => styleItem.modifyValue(v)} />
        </StyleControlRowWithReset>
    )
}

/** TextFieldWithReset */
export function TextFieldWithReset({ styleItem, label, labelComponent, labelAreaWidth, controlAreaWidth, enabled = true }: {
    styleItem: StyleItem
    label?: string
    labelComponent?: React.ReactNode
    labelAreaWidth?: number
    controlAreaWidth?: number
    enabled?: boolean
}): React.JSX.Element | null {
    return (
        <StyleControlRowWithReset styleItem={styleItem} label={label} labelComponent={labelComponent} labelAreaWidth={labelAreaWidth}
            controlAreaWidth={controlAreaWidth} enabled={enabled}>
            <TextField value={String(styleItem.value() ?? '')} label={label} enabled={enabled} onEdited={(v) => styleItem.modifyValue(v)} />
        </StyleControlRowWithReset>
    )
}

/** sets one coordinate of a point style item (QML: `styleItem.value.x = newValue`) */
export function setPointX(styleItem: StyleItem, x: number): void {
    const p = styleItem.value() as PointF
    styleItem.modifyValue(new PointF(x, p.y()))
}

export function setPointY(styleItem: StyleItem, y: number): void {
    const p = styleItem.value() as PointF
    styleItem.modifyValue(new PointF(p.x(), y))
}

/** StyledXYControllerWithReset */
export function StyledXYControllerWithReset({ styleItem, enabled = true }: { styleItem: StyleItem; enabled?: boolean }): React.JSX.Element {
    const p = styleItem.value() as PointF
    return (
        <div className="sd-row" style={{ gap: 6 }}>
            <SpinBox width={100} decimals={2} unit="sp" prefixIcon="HORIZONTAL" min={-100} max={100} step={0.1} value={p.x()}
                enabled={enabled} onEdited={(v) => setPointX(styleItem, v)} />
            <SpinBox width={100} decimals={2} unit="sp" prefixIcon="VERTICAL" min={-100} max={100} step={0.1} value={p.y()}
                enabled={enabled} onEdited={(v) => setPointY(styleItem, v)} />
            <StyleResetButton styleItem={styleItem} enabled={enabled && !styleItem.isDefault()} />
        </div>
    )
}

/** StyleToggleWithImage */
export function StyleToggleWithImage({ styleItem, imageON, imageOFF, text }: {
    styleItem: StyleItem; imageON: string; imageOFF: string; text: string
}): React.JSX.Element {
    const checked = styleItem.value() === true
    return (
        <div className="sd-row" style={{ gap: 15 }}>
            <StyledImage forceWidth={100} forceHeight={80} horizontalPadding={12} verticalPadding={10} source={checked ? imageON : imageOFF} />
            <ToggleButton text={text} checked={checked} onToggled={() => styleItem.modifyValue(!styleItem.value())} />
        </div>
    )
}

/** LineStyleSection */
export function LineStyleSection({ lineStyle, dashLineLength, dashGapLength, lineWidth }: {
    lineStyle: StyleItem; dashLineLength: StyleItem; dashGapLength: StyleItem; lineWidth: StyleItem
}): React.JSX.Element {
    return (
        <div className="sd-column" style={{ gap: 12 }}>
            <RadioButtonSelectorWithReset styleItem={lineStyle} label={qtrc('notation', 'Line style:')} model={[
                { iconCode: 'LINE_NORMAL', value: 0, title: qtrc('notation', 'Normal') },
                { iconCode: 'LINE_DASHED', value: 1, title: qtrc('notation', 'Dashed') },
                { iconCode: 'LINE_DOTTED', value: 2, title: qtrc('notation', 'Dotted') },
            ]} />
            <StyleSpinboxWithReset styleItem={lineWidth} label={qtrc('notation', 'Line thickness:')} suffix={qtrc('global', 'sp')} />
            <StyleSpinboxWithReset styleItem={dashLineLength} label={qtrc('notation', 'Dash (dashed line):')} step={0.1} />
            <StyleSpinboxWithReset styleItem={dashGapLength} label={qtrc('notation', 'Gap (dashed line):')} step={0.1} />
        </div>
    )
}

/** a GridLayout row of the slurs/ties sections: label, IncrementalPropertyControl, StyleResetButton */
export function SpinBoxGridRow({ styleItem, label, step, min = 0, max = 99.99, decimals = 2, unit = qtrc('global', 'sp'), width = 80 }: {
    styleItem: StyleItem; label: string; step: number; min?: number; max?: number; decimals?: number; unit?: string; width?: number
}): React.JSX.Element {
    return (
        <>
            <span className="sd-label">{label}</span>
            <SpinBox width={width} value={Number(styleItem.value())} min={min} max={max} step={step} decimals={decimals} unit={unit}
                label={label} onEdited={(v) => styleItem.modifyValue(v)} />
            <StyleResetButton styleItem={styleItem} />
        </>
    )
}

export function Grid({ children, columns = 3, columnSpacing = 8, rowSpacing = 8 }: {
    children: React.ReactNode; columns?: number; columnSpacing?: number; rowSpacing?: number
}): React.JSX.Element {
    return (
        <div className="sd-grid" style={{ gridTemplateColumns: `repeat(${columns}, auto)`, columnGap: columnSpacing, rowGap: rowSpacing }}>
            {children}
        </div>
    )
}
