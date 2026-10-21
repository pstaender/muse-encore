/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The Text section (port of src/inspector/qml/MuseScore/Inspector/text/TextInspectorView.qml and TextSettings.qml
 * with common/FrameSettings.qml).
 * TODO(port): "Insert special characters" (text editing), "Staff text properties" dialog, the font list of the
 * system (the font is a text field here).
 */
import { useContext, useEffect, useId, useState } from 'react'
import { inspectorPropertyChanges } from '../../../src/index'
import { qtrc } from '../../i18n'
import {
    ColorSection, DropdownPropertyView, flag, FlatButton, FlatRadioButtonGroupPropertyView, icon, InspectorContext, PlacementSection,
    prop, PropertyCheckBox, PropertyView, RadioButtons, Separator, ShowMore, SpinBoxPropertyView, type ModelRef, type Option,
    type PropertyHandle,
} from './common'
import { applyInspectorChanges, scoreChanged } from '../editbridge'

const tr = (key: string, disambiguation = ''): string => qtrc('inspector', key, disambiguation)

/** the font family (a dropdown of the system's fonts in MuseScore) */
function FontField({ p }: { p: PropertyHandle | null }): React.JSX.Element | null {
    const ctx = useContext(InspectorContext)
    const id = useId()
    const shown = typeof p?.info.value === 'string' ? p.info.value : ''
    const [text, setText] = useState(shown)
    useEffect(() => setText(shown), [shown])
    if (!p) {
        return null
    }
    const commit = (): void => {
        if (ctx.score && text && text !== shown
            && applyInspectorChanges(ctx.score, inspectorPropertyChanges(ctx.score, p.ref, text))) {
            scoreChanged()
        }
    }
    return (
        <PropertyView p={p} title={tr('Font')} id={id}>
            <input id={id} type="text" className="insp-text" value={text} placeholder={p.info.isUndefined ? '--' : ''}
                disabled={!ctx.canEdit || !p.info.isEnabled} onChange={(e) => setText(e.target.value)} onBlur={commit}
                onKeyDown={(e) => e.key === 'Enter' && commit()} />
        </PropertyView>
    )
}

/** the font style buttons (bold, italic, underline, strikethrough: flags of one value) */
function FontStyleButtons({ p }: { p: PropertyHandle | null }): React.JSX.Element | null {
    const { canEdit, score } = useContext(InspectorContext)
    if (!p) {
        return null
    }
    const style = p.info.isUndefined ? 0 : Number(p.info.value ?? 0)
    const buttons = [
        { icon: 'TEXT_BOLD', value: 1, title: tr('Bold') },
        { icon: 'TEXT_ITALIC', value: 2, title: tr('Italic') },
        { icon: 'TEXT_UNDERLINE', value: 4, title: tr('Underline') },
        { icon: 'TEXT_STRIKE', value: 8, title: tr('Strikethrough') },
    ]
    return (
        <PropertyView p={p} title={tr('Style')}>
            <div className="insp-radio-group" role="group" aria-label={tr('Style')}>
                {buttons.map(b => (
                    <button key={b.value} type="button" className="insp-radio insp-icon" aria-pressed={(style & b.value) !== 0}
                        title={b.title} aria-label={b.title} disabled={!canEdit || !p.info.isEnabled}
                        onClick={() => {
                            if (score && applyInspectorChanges(score, inspectorPropertyChanges(score, p.ref, style ^ b.value))) {
                                scoreChanged()
                            }
                        }}>
                        {icon(b.icon)}
                    </button>
                ))}
            </div>
        </PropertyView>
    )
}

function Alignment({ m }: { m: ModelRef }): React.JSX.Element | null {
    const h = prop(m, 'horizontalAlignment')
    const v = prop(m, 'verticalAlignment')
    const pos = prop(m, 'horizontalPosition')
    if (!h) {
        return null
    }
    const relativeToLine = flag(m, 'usePositionRelativeToLine', false)
    const hOptions: Option[] = [
        { icon: 'TEXT_ALIGN_LEFT', value: 0 /* AlignH::LEFT */, title: tr('Align left') },
        { icon: 'TEXT_ALIGN_CENTER', value: 2 /* HCENTER */, title: tr('Align center') },
        { icon: 'TEXT_ALIGN_RIGHT', value: 1 /* RIGHT */, title: tr('Align right') },
        { icon: 'TEXT_ALIGN_JUSTIFY', value: 3 /* JUSTIFY */, title: tr('Justify') },
    ]
    const posOptions: Option[] = [
        { icon: relativeToLine ? 'ALIGN_LEFT' : 'NOTE_ALIGN_LEFT', value: 0, title: flag(m, 'leftPositionText', '') },
        { icon: relativeToLine ? 'ALIGN_HORIZONTAL_CENTER' : 'NOTE_ALIGN_CENTER', value: 2, title: flag(m, 'centerPositionText', '') },
        { icon: relativeToLine ? 'ALIGN_RIGHT' : 'NOTE_ALIGN_RIGHT', value: 1, title: flag(m, 'rightPositionText', '') },
    ]
    const vOptions: Option[] = [
        { icon: 'TEXT_ALIGN_TOP', value: 0, title: tr('Align top') },
        { icon: 'TEXT_ALIGN_MIDDLE', value: 1, title: tr('Align middle') },
        { icon: 'TEXT_ALIGN_BOTTOM', value: 2, title: tr('Align bottom') },
        { icon: 'TEXT_ALIGN_BASELINE', value: 3, title: tr('Align baseline') },
    ]
    return (
        <PropertyView p={h} title={tr('Alignment')}>
            <div className="insp-row">
                {flag(m, 'isHorizontalAlignmentAvailable', true) && <RadioButtons p={h} options={hOptions} label={tr('Alignment')} />}
                {pos && flag(m, 'isPositionAvailable', true) && <RadioButtons p={pos} options={posOptions} label={tr('Position')} />}
            </div>
            {v && <RadioButtons p={v} options={vOptions} label={tr('Alignment')} />}
        </PropertyView>
    )
}

function FrameSettings({ m }: { m: ModelRef }): React.JSX.Element {
    const frameType = prop(m, 'frameType')
    const sp = qtrc('global', 'sp')
    return (
        <>
            <FlatRadioButtonGroupPropertyView p={frameType} title={tr('Frame')} options={[
                { text: tr('None', 'text frame type'), value: 0, title: tr('None', 'text frame type') },
                { icon: 'FRAME_SQUARE', value: 1, title: tr('Rectangle', 'text frame type') },
                { icon: 'FRAME_CIRCLE', value: 2, title: tr('Circle', 'text frame type') },
            ]} />
            {frameType && frameType.info.value !== 0 && (
                <>
                    <div className="insp-row">
                        <ColorSection p={prop(m, 'frameBorderColor')} title={tr('Border')} />
                        <ColorSection p={prop(m, 'frameFillColor')} title={tr('Fill color')} />
                    </div>
                    <div className="insp-row">
                        <SpinBoxPropertyView p={prop(m, 'frameThickness')} title={tr('Thickness')} unit={sp} step={0.1} min={0.1} max={5} half />
                        <SpinBoxPropertyView p={prop(m, 'frameMargin')} title={tr('Padding')} unit={sp} step={0.1} min={0} max={5} half />
                    </div>
                    <SpinBoxPropertyView p={prop(m, 'frameCornerRadius')} title={tr('Corner radius')} unit={sp} step={1} min={0} max={100} />
                </>
            )}
        </>
    )
}

/** TextSettings ("Show more") */
function TextSettings({ m }: { m: ModelRef }): React.JSX.Element {
    const dynamicsOnly = flag(m, 'isDynamicSpecificSettings', false)
    const symbolSize = flag(m, 'isSymbolSizeAvailable', false)
    return (
        <>
            <div className="insp-row">
                {symbolSize
                    ? <SpinBoxPropertyView p={prop(m, 'symbolSize')} title={tr('Symbol size')} unit={qtrc('global', 'pt')} step={0.5} min={1} max={99} half />
                    : <SpinBoxPropertyView p={prop(m, 'symbolScale')} title={tr('Scale')} unit="%" decimals={0} step={1} min={1} max={1000} half />}
            </div>
            <PropertyCheckBox p={prop(m, 'isSizeSpatiumDependent')} text={tr('Scale with staff size')} />
            {flag(m, 'isScriptSizeAvailable', true) && (
                <FlatRadioButtonGroupPropertyView p={prop(m, 'textScriptAlignment')} title="" options={[
                    { icon: 'TEXT_SUBSCRIPT', value: 2, title: tr('Subscript') },
                    { icon: 'TEXT_SUPERSCRIPT', value: 1, title: tr('Superscript') },
                ]} />
            )}
            {!dynamicsOnly && <FrameSettings m={m} />}
            {flag(m, 'isLineSpacingAvailable', true) && (
                <>
                    <Separator />
                    <SpinBoxPropertyView p={prop(m, 'textLineSpacing')} title={tr('Line spacing')} unit={qtrc('global', 'li')}
                        decimals={2} step={0.1} min={0} max={10} half />
                </>
            )}
            {!dynamicsOnly && (
                <>
                    <Separator />
                    <DropdownPropertyView p={prop(m, 'textType')} title={tr('Text style')} options={flag(m, 'textStyles', [])} />
                    {flag(m, 'isPositionAvailable', true) && <PlacementSection p={prop(m, 'textPlacement')} />}
                </>
            )}
            {flag(m, 'areStaffTextPropertiesAvailable', false) && (
                <FlatButton text={tr('Staff text properties')} enabled={false} onClick={() => {}} />
            )}
        </>
    )
}

export function TextInspectorView({ m }: { m: ModelRef }): React.JSX.Element {
    return (
        <div className="insp-column">
            <FontField p={prop(m, 'fontFamily')} />
            <div className="insp-row">
                <FontStyleButtons p={prop(m, 'fontStyle')} />
                <SpinBoxPropertyView p={prop(m, 'fontSize')} title={tr('Size')} unit={qtrc('global', 'pt')} step={1} min={1} max={99} half />
            </div>
            <Alignment m={m} />
            {!m.model.isEmpty && (
                <ShowMore>
                    <TextSettings m={m} />
                </ShowMore>
            )}
        </div>
    )
}
