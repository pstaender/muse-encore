/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/abstractinspectormodel.h/.cpp
 *
 * Deviation: the models do not change the score themselves (no undo stack here yet). Setting or resetting a
 * property item returns the changes C++ would apply in one undo command (InspectorChange: the item, the property
 * and the value in element units with the property flags); the editor applies them (TODO(port): undo stack).
 * There are no notifications: the list model is updated and the properties are reloaded on every request.
 */

import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { Score } from '../engraving/dom/score'
import { Pid, PropertyFlags, propertyType } from '../engraving/dom/property'
import type { Dynamic } from '../engraving/dom/dynamic'
import type { TempoText } from '../engraving/dom/tempotext'
import type { TextLineBaseSegment } from '../engraving/dom/textlinebase'
import { Sid } from '../engraving/style/styledef'
import { Spatium } from '../engraving/types/dimension'
import { Fraction } from '../engraving/types/fraction'
import { P_TYPE, type PropertyValue } from '../engraving/types/propertyvalue'
import { Align, DPMM, ElementType } from '../engraving/types/types'
import { Color } from '../framework/draw/types/color'
import { PointF, SizeF } from '../framework/draw/types/geometry'
import { qtrc } from '../framework/global/translation'
import { inspectorValueEquals, PropertyItem, type InspectorValue } from './propertyitem'
import { TEXT_ELEMENT_TYPES } from './types/texttypes'

export enum InspectorSectionType {
    SECTION_UNDEFINED = -1,
    SECTION_GENERAL,
    SECTION_MEASURES,
    SECTION_EMPTY_STAVES,
    SECTION_NOTATION,
    SECTION_TEXT,
    SECTION_SCORE_DISPLAY,
    SECTION_SCORE_APPEARANCE,
    SECTION_PARTS,
}

export enum InspectorModelType {
    TYPE_UNDEFINED = -1,
    TYPE_NOTE,
    TYPE_CHORD,
    TYPE_BEAM,
    TYPE_NOTEHEAD,
    TYPE_STEM,
    TYPE_HOOK,
    TYPE_FERMATA,
    TYPE_TEMPO,
    TYPE_A_TEMPO,
    TYPE_TEMPO_PRIMO,
    TYPE_GLISSANDO,
    TYPE_BARLINE,
    TYPE_BREATH,
    TYPE_MARKER,
    TYPE_SECTIONBREAK,
    TYPE_JUMP,
    TYPE_KEYSIGNATURE,
    TYPE_ACCIDENTAL,
    TYPE_ARPEGGIO,
    TYPE_CHORD_BRACKET,
    TYPE_FRET_DIAGRAM,
    TYPE_PEDAL,
    TYPE_SPACER,
    TYPE_CLEF,
    TYPE_HAIRPIN,
    TYPE_OTTAVA,
    TYPE_VOLTA,
    TYPE_VIBRATO,
    TYPE_SLUR,
    TYPE_HAMMER_ON_PULL_OFF,
    TYPE_TIE,
    TYPE_LAISSEZ_VIB,
    TYPE_PARTIAL_TIE,
    TYPE_CRESCENDO,
    TYPE_DIMINUENDO,
    TYPE_STAFF_TYPE_CHANGES,
    TYPE_TEXT_FRAME,
    TYPE_VERTICAL_FRAME,
    TYPE_HORIZONTAL_FRAME,
    TYPE_FRET_FRAME,
    TYPE_FRET_FRAME_CHORDS,
    TYPE_FRET_FRAME_SETTINGS,
    TYPE_ARTICULATION,
    TYPE_ORNAMENT,
    TYPE_TAPPING,
    TYPE_AMBITUS,
    TYPE_IMAGE,
    TYPE_CHORD_SYMBOL,
    TYPE_BRACKET,
    TYPE_TIME_SIGNATURE,
    TYPE_MMREST,
    TYPE_BEND,
    TYPE_TREMOLOBAR,
    TYPE_TREMOLO,
    TYPE_MEASURE_REPEAT,
    TYPE_DYNAMIC,
    TYPE_EXPRESSION,
    TYPE_TUPLET,
    TYPE_TEXT_LINE,
    TYPE_GRADUAL_TEMPO_CHANGE,
    TYPE_INSTRUMENT_NAME,
    TYPE_LYRICS,
    TYPE_LYRICS_LINE,
    TYPE_PARTIAL_LYRICS_LINE,
    TYPE_REST,
    TYPE_REST_BEAM,
    TYPE_REST_REST,
    TYPE_STRING_TUNINGS,
    TYPE_SYMBOL,
    TYPE_NOTELINE,
    TYPE_PLAY_COUNT_TEXT,
}

/** CommonTypes::MeasurementUnits */
export enum MeasurementUnits {
    UNITS_UNKNOWN = -1,
    UNITS_SPATIUM,
    UNITS_MM,
}

export interface ElementKey {
    type: ElementType
    subtype: number
}

/**
 * A change of the score requested by the inspector: `item.undoChangeProperty(pid, value, flags)`, or with
 * `reset` `item.undoResetProperty(pid)`. `command` marks changes C++ does through a score command instead
 * (Score::undoChangeVisible, cmdAddParenthesesToNotes / cmdRemoveParenthesesFromNotes).
 */
export interface InspectorChange {
    item: EngravingItem
    pid: Pid
    value?: PropertyValue
    flags?: PropertyFlags
    reset?: boolean
    command?: 'changeVisible' | 'addParentheses' | 'removeParentheses'
}

/** the element repository the models get their elements from (IElementRepositoryService) */
export interface IElementRepositoryService {
    findElementsByType(elementType: ElementType, filter?: (e: EngravingItem) => boolean): EngravingItem[]
    takeAllElements(): EngravingItem[]
    isRangeSelection(): boolean
    /** the score of the selection (C++: the current notation) */
    score(): Score | null
}

const NOTATION_ELEMENT_MODEL_TYPES = new Map<ElementType, InspectorModelType>([
    [ElementType.NOTE, InspectorModelType.TYPE_NOTE],
    [ElementType.STEM, InspectorModelType.TYPE_NOTE],
    [ElementType.NOTEDOT, InspectorModelType.TYPE_NOTE],
    [ElementType.NOTEHEAD, InspectorModelType.TYPE_NOTE],
    [ElementType.NOTELINE, InspectorModelType.TYPE_NOTE],
    [ElementType.SHADOW_NOTE, InspectorModelType.TYPE_NOTE],
    [ElementType.HOOK, InspectorModelType.TYPE_NOTE],
    [ElementType.BEAM, InspectorModelType.TYPE_NOTE],
    [ElementType.GLISSANDO, InspectorModelType.TYPE_GLISSANDO],
    [ElementType.GLISSANDO_SEGMENT, InspectorModelType.TYPE_GLISSANDO],
    [ElementType.VIBRATO, InspectorModelType.TYPE_VIBRATO],
    [ElementType.VIBRATO_SEGMENT, InspectorModelType.TYPE_VIBRATO],
    [ElementType.SLUR, InspectorModelType.TYPE_SLUR],
    [ElementType.SLUR_SEGMENT, InspectorModelType.TYPE_SLUR],
    [ElementType.HAMMER_ON_PULL_OFF, InspectorModelType.TYPE_HAMMER_ON_PULL_OFF],
    [ElementType.HAMMER_ON_PULL_OFF_SEGMENT, InspectorModelType.TYPE_HAMMER_ON_PULL_OFF],
    [ElementType.TIE, InspectorModelType.TYPE_TIE],
    [ElementType.TIE_SEGMENT, InspectorModelType.TYPE_TIE],
    [ElementType.LAISSEZ_VIB, InspectorModelType.TYPE_LAISSEZ_VIB],
    [ElementType.LAISSEZ_VIB_SEGMENT, InspectorModelType.TYPE_LAISSEZ_VIB],
    [ElementType.PARTIAL_TIE, InspectorModelType.TYPE_PARTIAL_TIE],
    [ElementType.PARTIAL_TIE_SEGMENT, InspectorModelType.TYPE_PARTIAL_TIE],
    [ElementType.TEMPO_TEXT, InspectorModelType.TYPE_TEMPO],
    [ElementType.FERMATA, InspectorModelType.TYPE_FERMATA],
    [ElementType.LAYOUT_BREAK, InspectorModelType.TYPE_SECTIONBREAK],
    [ElementType.BAR_LINE, InspectorModelType.TYPE_BARLINE],
    [ElementType.PLAY_COUNT_TEXT, InspectorModelType.TYPE_PLAY_COUNT_TEXT],
    [ElementType.MARKER, InspectorModelType.TYPE_MARKER],
    [ElementType.JUMP, InspectorModelType.TYPE_JUMP],
    [ElementType.KEYSIG, InspectorModelType.TYPE_KEYSIGNATURE],
    [ElementType.ACCIDENTAL, InspectorModelType.TYPE_ACCIDENTAL],
    [ElementType.FRET_DIAGRAM, InspectorModelType.TYPE_FRET_DIAGRAM],
    [ElementType.PEDAL, InspectorModelType.TYPE_PEDAL],
    [ElementType.PEDAL_SEGMENT, InspectorModelType.TYPE_PEDAL],
    [ElementType.SPACER, InspectorModelType.TYPE_SPACER],
    [ElementType.CLEF, InspectorModelType.TYPE_CLEF],
    [ElementType.HAIRPIN, InspectorModelType.TYPE_HAIRPIN],
    [ElementType.HAIRPIN_SEGMENT, InspectorModelType.TYPE_HAIRPIN],
    [ElementType.OTTAVA, InspectorModelType.TYPE_OTTAVA],
    [ElementType.OTTAVA_SEGMENT, InspectorModelType.TYPE_OTTAVA],
    [ElementType.VOLTA, InspectorModelType.TYPE_VOLTA],
    [ElementType.VOLTA_SEGMENT, InspectorModelType.TYPE_VOLTA],
    [ElementType.STAFFTYPE_CHANGE, InspectorModelType.TYPE_STAFF_TYPE_CHANGES],
    [ElementType.TBOX, InspectorModelType.TYPE_TEXT_FRAME],
    [ElementType.VBOX, InspectorModelType.TYPE_VERTICAL_FRAME],
    [ElementType.HBOX, InspectorModelType.TYPE_HORIZONTAL_FRAME],
    [ElementType.FBOX, InspectorModelType.TYPE_FRET_FRAME],
    [ElementType.ARTICULATION, InspectorModelType.TYPE_ARTICULATION],
    [ElementType.TAPPING, InspectorModelType.TYPE_TAPPING],
    [ElementType.TAPPING_HALF_SLUR_SEGMENT, InspectorModelType.TYPE_TAPPING],
    [ElementType.ORNAMENT, InspectorModelType.TYPE_ORNAMENT],
    [ElementType.TRILL, InspectorModelType.TYPE_ORNAMENT],
    [ElementType.TRILL_SEGMENT, InspectorModelType.TYPE_ORNAMENT],
    [ElementType.IMAGE, InspectorModelType.TYPE_IMAGE],
    [ElementType.HARMONY, InspectorModelType.TYPE_CHORD_SYMBOL],
    [ElementType.AMBITUS, InspectorModelType.TYPE_AMBITUS],
    [ElementType.BRACKET, InspectorModelType.TYPE_BRACKET],
    [ElementType.TIMESIG, InspectorModelType.TYPE_TIME_SIGNATURE],
    [ElementType.MMREST, InspectorModelType.TYPE_MMREST],
    [ElementType.BEND, InspectorModelType.TYPE_BEND],
    [ElementType.GUITAR_BEND, InspectorModelType.TYPE_BEND],
    [ElementType.GUITAR_BEND_SEGMENT, InspectorModelType.TYPE_BEND],
    [ElementType.GUITAR_BEND_HOLD, InspectorModelType.TYPE_BEND],
    [ElementType.GUITAR_BEND_HOLD_SEGMENT, InspectorModelType.TYPE_BEND],
    [ElementType.TREMOLOBAR, InspectorModelType.TYPE_TREMOLOBAR],
    [ElementType.TREMOLO_SINGLECHORD, InspectorModelType.TYPE_TREMOLO],
    [ElementType.TREMOLO_TWOCHORD, InspectorModelType.TYPE_TREMOLO],
    [ElementType.MEASURE_REPEAT, InspectorModelType.TYPE_MEASURE_REPEAT],
    [ElementType.TUPLET, InspectorModelType.TYPE_TUPLET],
    [ElementType.TEXTLINE, InspectorModelType.TYPE_TEXT_LINE],
    [ElementType.TEXTLINE_SEGMENT, InspectorModelType.TYPE_TEXT_LINE],
    [ElementType.PALM_MUTE, InspectorModelType.TYPE_TEXT_LINE],
    [ElementType.PALM_MUTE_SEGMENT, InspectorModelType.TYPE_TEXT_LINE],
    [ElementType.LET_RING, InspectorModelType.TYPE_TEXT_LINE],
    [ElementType.LET_RING_SEGMENT, InspectorModelType.TYPE_TEXT_LINE],
    [ElementType.WHAMMY_BAR, InspectorModelType.TYPE_TEXT_LINE],
    [ElementType.WHAMMY_BAR_SEGMENT, InspectorModelType.TYPE_TEXT_LINE],
    // C++ QMap: the later NOTELINE entries replace the TYPE_NOTE one above
    [ElementType.NOTELINE, InspectorModelType.TYPE_NOTELINE],
    [ElementType.NOTELINE_SEGMENT, InspectorModelType.TYPE_NOTELINE],
    [ElementType.GRADUAL_TEMPO_CHANGE, InspectorModelType.TYPE_GRADUAL_TEMPO_CHANGE],
    [ElementType.GRADUAL_TEMPO_CHANGE_SEGMENT, InspectorModelType.TYPE_GRADUAL_TEMPO_CHANGE],
    [ElementType.INSTRUMENT_NAME, InspectorModelType.TYPE_INSTRUMENT_NAME],
    [ElementType.LYRICS, InspectorModelType.TYPE_LYRICS],
    [ElementType.LYRICSLINE, InspectorModelType.TYPE_LYRICS_LINE],
    [ElementType.LYRICSLINE_SEGMENT, InspectorModelType.TYPE_LYRICS_LINE],
    [ElementType.PARTIAL_LYRICSLINE, InspectorModelType.TYPE_PARTIAL_LYRICS_LINE],
    [ElementType.PARTIAL_LYRICSLINE_SEGMENT, InspectorModelType.TYPE_PARTIAL_LYRICS_LINE],
    [ElementType.REST, InspectorModelType.TYPE_REST],
    [ElementType.DYNAMIC, InspectorModelType.TYPE_DYNAMIC],
    [ElementType.EXPRESSION, InspectorModelType.TYPE_EXPRESSION],
    [ElementType.STRING_TUNINGS, InspectorModelType.TYPE_STRING_TUNINGS],
    [ElementType.SYMBOL, InspectorModelType.TYPE_SYMBOL],
    [ElementType.SYSTEM_DIVIDER, InspectorModelType.TYPE_SYMBOL],
    [ElementType.CHORD_BRACKET, InspectorModelType.TYPE_CHORD_BRACKET],
])

const HAIRPIN_ELEMENT_MODEL_TYPES = new Map<number, InspectorModelType>([
    [0 /* CRESC_HAIRPIN */, InspectorModelType.TYPE_HAIRPIN],
    [1 /* DIM_HAIRPIN */, InspectorModelType.TYPE_HAIRPIN],
    [2 /* CRESC_LINE */, InspectorModelType.TYPE_CRESCENDO],
    [3 /* DIM_LINE */, InspectorModelType.TYPE_DIMINUENDO],
])

const LAYOUT_BREAK_ELEMENT_MODEL_TYPES = new Map<number, InspectorModelType>([
    [2 /* LayoutBreakType::SECTION */, InspectorModelType.TYPE_SECTIONBREAK],
])

const TEMPO_TEXT_ELEMENT_MODEL_TYPES = new Map<number, InspectorModelType>([
    [0 /* NORMAL */, InspectorModelType.TYPE_TEMPO],
    [1 /* A_TEMPO */, InspectorModelType.TYPE_A_TEMPO],
    [2 /* TEMPO_PRIMO */, InspectorModelType.TYPE_TEMPO_PRIMO],
])

/** muse::DataFormatter::roundDouble (2 decimals) */
export function roundDouble(v: number, decimals = 2): number {
    const f = 10 ** decimals
    return Math.round(v * f) / f
}

/** AbstractInspectorModel's formatDoubleFunc */
export const formatDoubleFunc = (v: InspectorValue): InspectorValue => roundDouble(Number(v))

export type ConvertPropertyValueFunc = (v: InspectorValue) => InspectorValue | undefined

function isPureDynamics(selectedElementList: readonly EngravingItem[]): boolean {
    if (!selectedElementList.length) {
        return false
    }
    for (const item of selectedElementList) {
        if (!item.isTextBase()) {
            continue
        }
        if (!item.isDynamic()) {
            return false
        }
        if ((item as unknown as Dynamic).hasCustomText()) {
            return false
        }
    }
    return true
}

function hasValidTextLineBaseSegment(selectedElementList: readonly EngravingItem[]): boolean {
    for (const item of selectedElementList) {
        if (!item.isTextLineBaseSegment()) {
            continue
        }
        const tlb = (item as unknown as TextLineBaseSegment).textLineBase()
        if (tlb && (tlb.beginText() || tlb.continueText() || tlb.endText())) {
            return true
        }
    }
    return false
}

export abstract class AbstractInspectorModel {
    protected m_elementList: EngravingItem[] = []
    private m_title = ''
    private m_icon = ''
    private m_sectionType = InspectorSectionType.SECTION_UNDEFINED
    private m_modelType = InspectorModelType.TYPE_UNDEFINED
    private m_elementType = ElementType.INVALID
    protected m_measurementUnits = MeasurementUnits.UNITS_UNKNOWN
    protected m_isSystemObjectBelowBottomStaff = false

    constructor(protected readonly m_repository: IElementRepositoryService, elementType = ElementType.INVALID) {
        this.m_elementType = elementType
    }

    // ---- the models' interface (pure virtual in C++) ----

    /** the property items by the names of the C++ Q_PROPERTYs (the UI refers to them by these names) */
    abstract properties(): Record<string, PropertyItem>
    abstract loadProperties(): void
    /** further state of the model for the UI (other Q_PROPERTYs, e.g. availability flags, option lists) */
    flags(): Record<string, unknown> { return {} }

    title(): string { return this.m_title }
    icon(): string { return this.m_icon }
    sectionType(): InspectorSectionType { return this.m_sectionType }
    modelType(): InspectorModelType { return this.m_modelType }
    measurementUnits(): MeasurementUnits { return this.m_measurementUnits }
    isSystemObjectBelowBottomStaff(): boolean { return this.m_isSystemObjectBelowBottomStaff }

    protected setTitle(title: string): void { this.m_title = title }
    /** an IconCode name (muse::ui::IconCode::Code) */
    protected setIcon(icon: string): void { this.m_icon = icon }
    protected setSectionType(t: InspectorSectionType): void { this.m_sectionType = t }
    protected setModelType(t: InspectorModelType): void { this.m_modelType = t }
    protected setElementType(t: ElementType): void { this.m_elementType = t }

    isEmpty(): boolean {
        return this.m_elementList.length === 0
    }

    elementList(): readonly EngravingItem[] {
        return this.m_elementList
    }

    /** AbstractInspectorModel::updateProperties (on elementsUpdated) */
    updateProperties(): void {
        this.requestElements()
        if (!this.isEmpty()) {
            this.loadProperties()
        }
    }

    requestElements(): void {
        if (this.m_elementType !== ElementType.INVALID) {
            this.m_elementList = this.m_repository.findElementsByType(this.m_elementType)
        }
    }

    /** "Reset all" (requestResetToDefaults): the resets of all property items */
    requestResetToDefaults(): InspectorChange[] {
        return Object.values(this.properties()).flatMap(p => p.resetToDefault())
    }

    // ---- static helpers ----

    static makeKey(item: EngravingItem): ElementKey {
        if (item.type() === ElementType.TEMPO_TEXT) {
            return { type: ElementType.TEMPO_TEXT, subtype: (item as unknown as TempoText).tempoTextType() }
        }
        return { type: item.type(), subtype: item.subtype() }
    }

    static modelTypeByElementKey(key: ElementKey): InspectorModelType {
        if (key.type === ElementType.HAIRPIN || key.type === ElementType.HAIRPIN_SEGMENT) {
            return HAIRPIN_ELEMENT_MODEL_TYPES.get(key.subtype) ?? InspectorModelType.TYPE_UNDEFINED
        }
        if (key.type === ElementType.LAYOUT_BREAK) {
            return LAYOUT_BREAK_ELEMENT_MODEL_TYPES.get(key.subtype) ?? InspectorModelType.TYPE_UNDEFINED
        }
        if (key.type === ElementType.TEMPO_TEXT) {
            return TEMPO_TEXT_ELEMENT_MODEL_TYPES.get(key.subtype) ?? InspectorModelType.TYPE_UNDEFINED
        }
        return NOTATION_ELEMENT_MODEL_TYPES.get(key.type) ?? InspectorModelType.TYPE_UNDEFINED
    }

    static modelTypesByElementKeys(keys: readonly ElementKey[]): Set<InspectorModelType> {
        return new Set(keys.map(k => AbstractInspectorModel.modelTypeByElementKey(k)))
    }

    static sectionTypesByElementKeys(keys: readonly ElementKey[], isRange: boolean,
        selectedElementList: readonly EngravingItem[]): Set<InspectorSectionType> {
        const types = new Set<InspectorSectionType>()
        for (const key of keys) {
            if (NOTATION_ELEMENT_MODEL_TYPES.has(key.type)
                && AbstractInspectorModel.modelTypeByElementKey(key) !== InspectorModelType.TYPE_UNDEFINED) {
                types.add(InspectorSectionType.SECTION_NOTATION)
            }
            // Don't show the "Text" inspector panel for "pure" dynamics (i.e. without custom text)
            // TODO(port): barlineWithPlayText (no PlayCountText yet)
            if (TEXT_ELEMENT_TYPES.includes(key.type) && !isPureDynamics(selectedElementList)) {
                types.add(InspectorSectionType.SECTION_TEXT)
            }
            if (hasValidTextLineBaseSegment(selectedElementList)) {
                types.add(InspectorSectionType.SECTION_TEXT)
            }
            if (key.type !== ElementType.INSTRUMENT_NAME) {
                types.add(InspectorSectionType.SECTION_GENERAL)
            }
        }
        if (isRange) {
            types.add(InspectorSectionType.SECTION_MEASURES)
            // TODO(port): SECTION_EMPTY_STAVES (EmptyStavesVisibilitySettingsModel)
        }
        if (AbstractInspectorModel.showPartsSection(selectedElementList)) {
            types.add(InspectorSectionType.SECTION_PARTS)
        }
        return types
    }

    static showPartsSection(selectedElementList: readonly EngravingItem[]): boolean {
        const noAvailableChangePartsSettingsTypes = [ElementType.LAYOUT_BREAK, ElementType.ACCIDENTAL, ElementType.SOUND_FLAG]
        for (const element of selectedElementList) {
            if ((!element.score().isMaster() && !noAvailableChangePartsSettingsTypes.includes(element.type()))
                || element.canBeExcludedFromOtherParts()) {
                return true
            }
        }
        return false
    }

    // ---- properties ----

    /** C++ buildPropertyItem: the default callbacks change/reset the property of all elements of the model */
    protected buildPropertyItem(pid: Pid, onModified?: (pid: Pid, value: InspectorValue) => InspectorChange[],
        onReset?: (pid: Pid) => InspectorChange[]): PropertyItem {
        const item = new PropertyItem(pid)
        item.onModified = onModified ? (v) => onModified(pid, v) : (v) => this.onPropertyValueChanged(pid, v)
        item.onReset = onReset ? () => onReset(pid) : () => this.onPropertyValueReset(pid)
        return item
    }

    /** buildPointFPropertyItem: a point item ({x, y} values) */
    protected buildPointFPropertyItem(pid: Pid, onModified?: (pid: Pid, value: InspectorValue) => InspectorChange[],
        onReset?: (pid: Pid) => InspectorChange[]): PropertyItem {
        return this.buildPropertyItem(pid, onModified, onReset)
    }

    protected onPropertyValueChanged(pid: Pid, newValue: InspectorValue): InspectorChange[] {
        return this.setPropertyValue(this.m_elementList, pid, newValue)
    }

    protected setPropertyValue(items: readonly EngravingItem[], pid: Pid, newValue: InspectorValue): InspectorChange[] {
        const changes: InspectorChange[] = []
        for (const item of items) {
            let ps = item.propertyFlags(pid)
            if (ps === PropertyFlags.STYLED) {
                ps = PropertyFlags.UNSTYLED
            }
            changes.push({ item, pid, value: this.valueToElementUnits(pid, newValue, item), flags: ps })
        }
        return changes
    }

    protected onPropertyValueReset(pid: Pid): InspectorChange[] {
        return this.resetPropertyValue(this.m_elementList, pid)
    }

    protected resetPropertyValue(items: readonly EngravingItem[], pid: Pid): InspectorChange[] {
        return items.map(item => ({ item, pid, reset: true }))
    }

    styleIdByPropertyId(pid: Pid): Sid {
        for (const element of this.m_elementList) {
            const result = element.getPropertyStyle(pid)
            if (result !== Sid.NOSTYLE) {
                return result
            }
        }
        return Sid.NOSTYLE
    }

    /** AbstractInspectorModel::valueToElementUnits */
    valueToElementUnits(pid: Pid, value: InspectorValue, element: EngravingItem): PropertyValue {
        if (pid === Pid.VERSE) {
            return Number(value) - 1
        }
        switch (propertyType(pid)) {
        case P_TYPE.POINT: {
            const p = value as { x: number; y: number }
            const f = (pid === Pid.OFFSET ? element.offsetIsSpatiumDependent() : element.sizeIsSpatiumDependent()) ? element.spatium() : DPMM
            return new PointF(p.x * f, p.y * f)
        }
        case P_TYPE.MILLIMETRE:
            return Number(value) * element.spatium()
        case P_TYPE.SPATIUM:
            return new Spatium(Number(value))
        case P_TYPE.TEMPO:
            return Number(value) / 60
        case P_TYPE.INT_VEC:
            return String(value).split(',').map(s => parseInt(s.trim(), 10)).filter(i => !Number.isNaN(i))
        case P_TYPE.COLOR:
            return Color.fromString(String(value))
        case P_TYPE.ALIGN: {
            const a = value as number[]
            return new Align(a[0], a[1])
        }
        case P_TYPE.SCALE:
        case P_TYPE.SIZE: {
            const a = value as number[]
            return new SizeF(a[0], a[1])
        }
        default:
            return value as PropertyValue
        }
    }

    /** AbstractInspectorModel::valueFromElementUnits; undefined: the element does not support the property */
    valueFromElementUnits(pid: Pid, value: PropertyValue, element: EngravingItem): InspectorValue | undefined {
        if (value === undefined || value === null) {
            return undefined
        }
        if (pid === Pid.VERSE) {
            return Number(value) + 1
        }
        switch (propertyType(pid)) {
        case P_TYPE.POINT: {
            const p = value as PointF
            const f = (pid === Pid.OFFSET ? element.offsetIsSpatiumDependent() : element.sizeIsSpatiumDependent()) ? element.spatium() : DPMM
            return { x: p.x() / f, y: p.y() / f }
        }
        case P_TYPE.MILLIMETRE:
            return Number(value) / element.spatium()
        case P_TYPE.SPATIUM:
            return value instanceof Spatium ? value.val() : Number(value)
        case P_TYPE.TEMPO:
            return Number(value) * 60
        case P_TYPE.INT_VEC:
            return (value as number[]).join(',')
        default:
            break
        }
        if (value instanceof Color) {
            return value.a >= 255 ? value.toString() : `#${value.a.toString(16).padStart(2, '0')}${value.toString().slice(1)}`
        }
        if (value instanceof SizeF) {
            return [value.width(), value.height()]
        }
        if (value instanceof Align) {
            return [value.horizontal, value.vertical]
        }
        if (value instanceof Spatium) {
            return value.val()
        }
        if (value instanceof Fraction) {
            return value.toString()
        }
        if (value instanceof PointF) {
            return { x: value.x(), y: value.y() }
        }
        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
            return value
        }
        if (Array.isArray(value)) {
            return value as number[]
        }
        return String(value)
    }

    protected loadPropertyItem(propertyItem: PropertyItem, elementsOrConvert?: readonly EngravingItem[] | ConvertPropertyValueFunc,
        convert?: ConvertPropertyValueFunc): void {
        const elements = Array.isArray(elementsOrConvert) ? elementsOrConvert as readonly EngravingItem[] : this.m_elementList
        const convertFunc = typeof elementsOrConvert === 'function' ? elementsOrConvert : convert
        if (!elements.length) {
            propertyItem.setIsEnabled(false)
            return
        }

        const pid = propertyItem.propertyId()
        propertyItem.setStyleId(this.styleIdByPropertyId(pid))

        let propertyValue: InspectorValue | undefined
        let valid = false
        let isUndefined = false
        let isModified = false

        for (const element of elements) {
            let current = this.valueFromElementUnits(pid, element.getProperty(pid), element)
            let def = this.valueFromElementUnits(pid, element.propertyDefault(pid), element)
            if (current === undefined) {
                continue // the property is not supported by the element
            }
            if (convertFunc) {
                current = convertFunc(current)
                def = def !== undefined ? convertFunc(def) : undefined
            }
            if (!valid) {
                propertyValue = current
                valid = true
            }
            if (!isUndefined && !inspectorValueEquals(propertyValue, current)) {
                isUndefined = true
            }
            if (!isModified && (element.propertyFlags(pid) === PropertyFlags.UNSTYLED || !inspectorValueEquals(current, def))) {
                isModified = true
            }
            if (isUndefined && isModified) {
                break
            }
        }

        // Some elements may support the property, some don't
        propertyItem.setIsEnabled(valid)
        propertyItem.updateCurrentValue(isUndefined ? undefined : propertyValue)
        propertyItem.setIsModified(isModified)
    }

    protected updateIsSystemObjectBelowBottomStaff(): void {
        this.m_isSystemObjectBelowBottomStaff = this.m_elementList.some(e => e.isSystemObjectBelowBottomStaff())
    }

    protected updatemeasurementUnits(): void {
        let result = MeasurementUnits.UNITS_UNKNOWN
        for (const item of this.m_elementList) {
            const itemUnits = item.offsetIsSpatiumDependent() ? MeasurementUnits.UNITS_SPATIUM : MeasurementUnits.UNITS_MM
            if (result !== MeasurementUnits.UNITS_UNKNOWN && itemUnits !== result) {
                result = MeasurementUnits.UNITS_UNKNOWN
                break
            }
            result = itemUnits
        }
        this.m_measurementUnits = result
    }

    protected isMasterNotation(): boolean {
        return this.m_elementList[0]?.score().isMaster() ?? true
    }

    protected static tr(key: string, disambiguation = ''): string {
        return qtrc('inspector', key, disambiguation)
    }
}
