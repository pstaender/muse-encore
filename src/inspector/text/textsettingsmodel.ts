/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/text/textsettingsmodel.h/.cpp
 * TODO(port): text editing state (special characters, chord symbol editing), "Staff text properties" dialog.
 */

import type { Dynamic } from '../../engraving/dom/dynamic'
import type { EngravingItem } from '../../engraving/dom/engravingitem'
import { Pid } from '../../engraving/dom/property'
import { TextBase, VerticalAlignment } from '../../engraving/dom/textbase'
import type { TextLineBaseSegment } from '../../engraving/dom/textlinebase'
import { TConv } from '../../engraving/types/typesconv'
import { ElementType, FontStyle, TextStyleType } from '../../engraving/types/types'
import {
    AbstractInspectorModel, formatDoubleFunc, InspectorSectionType, roundDouble, type IElementRepositoryService,
} from '../abstractinspectormodel'
import type { InspectorValue, PropertyItem } from '../propertyitem'
import { FrameType, TEXT_TYPE_STAFF } from '../types/texttypes'

export class TextSettingsModel extends AbstractInspectorModel {
    private m_fontFamily!: PropertyItem
    private m_fontStyle!: PropertyItem
    private m_fontSize!: PropertyItem
    private m_textLineSpacing!: PropertyItem
    private m_horizontalAlignment!: PropertyItem
    private m_verticalAlignment!: PropertyItem
    private m_horizontalPosition!: PropertyItem
    private m_symbolSize!: PropertyItem
    private m_symbolScale!: PropertyItem
    private m_isSizeSpatiumDependent!: PropertyItem
    private m_frameType!: PropertyItem
    private m_frameBorderColor!: PropertyItem
    private m_frameFillColor!: PropertyItem
    private m_frameThickness!: PropertyItem
    private m_frameMargin!: PropertyItem
    private m_frameCornerRadius!: PropertyItem
    private m_textType!: PropertyItem
    private m_textPlacement!: PropertyItem
    private m_textScriptAlignment!: PropertyItem

    private m_areStaffTextPropertiesAvailable = false
    private m_isDynamicSpecificSettings = false
    private m_isHorizontalAlignmentAvailable = true
    private m_isSymbolSizeAvailable = false
    private m_isScriptSizeAvailable = true
    private m_isLineSpacingAvailable = true
    private m_isPositionAvailable = true
    private m_usePositionRelativeToLine = false
    private m_leftPositionText = ''
    private m_centerPositionText = ''
    private m_rightPositionText = ''

    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setSectionType(InspectorSectionType.SECTION_TEXT)
        this.setTitle(AbstractInspectorModel.tr('Text'))
        this.createProperties()
    }

    private createProperties(): void {
        this.m_fontFamily = this.buildPropertyItem(Pid.FONT_FACE)
        this.m_fontStyle = this.buildPropertyItem(Pid.FONT_STYLE)
        this.m_fontSize = this.buildPropertyItem(Pid.FONT_SIZE)
        this.m_textLineSpacing = this.buildPropertyItem(Pid.TEXT_LINE_SPACING)
        // the alignment is one property [h, v] shown as two items
        this.m_horizontalAlignment = this.buildPropertyItem(Pid.ALIGN,
            (pid, v) => this.onPropertyValueChanged(pid, [Number(v), Number(this.m_verticalAlignment.value() ?? 0)]))
        this.m_verticalAlignment = this.buildPropertyItem(Pid.ALIGN,
            (pid, v) => this.onPropertyValueChanged(pid, [Number(this.m_horizontalAlignment.value() ?? 0), Number(v)]))
        this.m_horizontalPosition = this.buildPropertyItem(Pid.POSITION)
        this.m_symbolSize = this.buildPropertyItem(Pid.MUSIC_SYMBOL_SIZE)
        this.m_symbolScale = this.buildPropertyItem(Pid.MUSICAL_SYMBOLS_SCALE, (pid, v) => this.onPropertyValueChanged(pid, Number(v) / 100))
        this.m_isSizeSpatiumDependent = this.buildPropertyItem(Pid.SIZE_SPATIUM_DEPENDENT)
        this.m_frameType = this.buildPropertyItem(Pid.FRAME_TYPE)
        this.m_frameBorderColor = this.buildPropertyItem(Pid.FRAME_FG_COLOR)
        this.m_frameFillColor = this.buildPropertyItem(Pid.FRAME_BG_COLOR)
        this.m_frameThickness = this.buildPropertyItem(Pid.FRAME_WIDTH)
        this.m_frameMargin = this.buildPropertyItem(Pid.FRAME_PADDING)
        this.m_frameCornerRadius = this.buildPropertyItem(Pid.FRAME_ROUND)
        this.m_textType = this.buildPropertyItem(Pid.TEXT_STYLE)
        this.m_textPlacement = this.buildPropertyItem(Pid.PLACEMENT)
        this.m_textScriptAlignment = this.buildPropertyItem(Pid.TEXT_SCRIPT_ALIGN)
    }

    override properties(): Record<string, PropertyItem> {
        return {
            fontFamily: this.m_fontFamily, fontStyle: this.m_fontStyle, fontSize: this.m_fontSize,
            textLineSpacing: this.m_textLineSpacing, horizontalAlignment: this.m_horizontalAlignment,
            verticalAlignment: this.m_verticalAlignment, horizontalPosition: this.m_horizontalPosition,
            symbolSize: this.m_symbolSize, symbolScale: this.m_symbolScale, isSizeSpatiumDependent: this.m_isSizeSpatiumDependent,
            frameType: this.m_frameType, frameBorderColor: this.m_frameBorderColor, frameFillColor: this.m_frameFillColor,
            frameThickness: this.m_frameThickness, frameMargin: this.m_frameMargin, frameCornerRadius: this.m_frameCornerRadius,
            textType: this.m_textType, textPlacement: this.m_textPlacement, textScriptAlignment: this.m_textScriptAlignment,
        }
    }

    override flags(): Record<string, unknown> {
        return {
            areTextPropertiesAvailable: true,
            areStaffTextPropertiesAvailable: this.m_areStaffTextPropertiesAvailable,
            isSpecialCharactersInsertionAvailable: false,
            isDynamicSpecificSettings: this.m_isDynamicSpecificSettings,
            isHorizontalAlignmentAvailable: this.m_isHorizontalAlignmentAvailable,
            isSymbolSizeAvailable: this.m_isSymbolSizeAvailable,
            isScriptSizeAvailable: this.m_isScriptSizeAvailable,
            isLineSpacingAvailable: this.m_isLineSpacingAvailable,
            isPositionAvailable: this.m_isPositionAvailable,
            usePositionRelativeToLine: this.m_usePositionRelativeToLine,
            leftPositionText: this.m_leftPositionText,
            centerPositionText: this.m_centerPositionText,
            rightPositionText: this.m_rightPositionText,
            isSystemObjectBelowBottomStaff: this.m_isSystemObjectBelowBottomStaff,
            textStyles: this.textStyles(),
        }
    }

    /** TextSettingsModel::textStyles: all text styles (the score's names of the user styles) */
    textStyles(): { text: string; value: number }[] {
        const score = this.m_repository.score()
        const styles: { text: string; value: number }[] = []
        for (let t = TextStyleType.DEFAULT + 1; t < TextStyleType.TEXT_TYPES; ++t) {
            const name = score ? score.getTextStyleUserName(t) : TConv.userNameTextStyleType(t)
            styles.push({ text: name.translated(), value: t })
        }
        return styles
    }

    override requestElements(): void {
        this.m_elementList = []
        for (const elem of this.m_repository.findElementsByType(ElementType.TEXT)) {
            const parent = elem.explicitParent()
            if (!parent || !parent.isTextLineBaseSegment()) {
                this.m_elementList.push(elem)
                continue
            }
            // get/set the properties of the TextLineBase instead of the text itself
            const tlb = (parent as unknown as TextLineBaseSegment).textLineBase() as unknown as EngravingItem
            if (!this.m_elementList.includes(tlb)) {
                this.m_elementList.push(tlb)
            }
        }
    }

    override loadProperties(): void {
        this.loadPropertyItem(this.m_fontFamily, (v) => v === TextBase.UNDEFINED_FONT_FAMILY ? undefined : v)
        this.m_fontFamily.setIsEnabled(true)
        this.loadPropertyItem(this.m_fontStyle, (v) => v === FontStyle.Undefined ? undefined : v)
        this.m_fontStyle.setIsEnabled(true)
        this.loadPropertyItem(this.m_fontSize, (v) => v === TextBase.UNDEFINED_FONT_SIZE ? undefined : v)
        this.m_fontSize.setIsEnabled(true)
        this.loadPropertyItem(this.m_textLineSpacing, formatDoubleFunc)
        this.loadPropertyItem(this.m_horizontalAlignment, (v) => Array.isArray(v) && v.length >= 2 ? v[0] : undefined)
        this.loadPropertyItem(this.m_verticalAlignment, (v) => Array.isArray(v) && v.length >= 2 ? v[1] : undefined)
        this.loadPropertyItem(this.m_horizontalPosition)
        this.loadPropertyItem(this.m_symbolSize)
        this.loadPropertyItem(this.m_symbolScale, (v) => Math.trunc(roundDouble(Number(v) * 100)))
        this.loadPropertyItem(this.m_isSizeSpatiumDependent)
        this.loadPropertyItem(this.m_frameType)
        this.loadPropertyItem(this.m_frameBorderColor)
        this.loadPropertyItem(this.m_frameFillColor)
        this.loadPropertyItem(this.m_frameThickness, formatDoubleFunc)
        this.loadPropertyItem(this.m_frameMargin, formatDoubleFunc)
        this.loadPropertyItem(this.m_frameCornerRadius, formatDoubleFunc)
        this.loadPropertyItem(this.m_textType)
        this.loadPropertyItem(this.m_textPlacement)
        this.loadPropertyItem(this.m_textScriptAlignment, (v) => v === VerticalAlignment.AlignUndefined ? undefined : v)

        this.updateFramePropertiesAvailability()
        this.updateStaffPropertiesAvailability()
        const items = this.m_elementList
        this.m_isDynamicSpecificSettings = items.every(i => i.isDynamic())
        this.m_isHorizontalAlignmentAvailable = items.some(i => !(i.isDynamic() && (i as unknown as Dynamic).centerOnNotehead()))
        this.updateIsSystemObjectBelowBottomStaff()
        this.m_isSymbolSizeAvailable = items.some(i => (i.isTextLineBase() && !(i.isOttava() || i.isPedal()))
            || (i.isTextBase() && (i as unknown as TextBase).hasSymbolSize()))
        this.m_isScriptSizeAvailable = !items.some(i => i.isHarmony())
        this.m_isLineSpacingAvailable = !items.some(i => i.isHarmony())
        this.updateIsPositionAvailable()
        this.m_usePositionRelativeToLine = items.some(i => i.isTextBase() && !(i as unknown as TextBase).positionRelativeToNoteheadRest())
        this.updatePositionTexts()
    }

    private updateFramePropertiesAvailability(): void {
        const frameType = Number(this.m_frameType.value() as InspectorValue | undefined ?? 0)
        const isFrameVisible = frameType !== FrameType.FRAME_TYPE_NONE
        this.m_frameThickness.setIsEnabled(isFrameVisible)
        this.m_frameBorderColor.setIsEnabled(isFrameVisible)
        this.m_frameFillColor.setIsEnabled(isFrameVisible)
        this.m_frameMargin.setIsEnabled(isFrameVisible)
        this.m_frameCornerRadius.setIsEnabled(frameType === FrameType.FRAME_TYPE_SQUARE)
    }

    private updateStaffPropertiesAvailability(): void {
        const isAvailable = Number(this.m_textType.value() ?? -1) === TEXT_TYPE_STAFF
        this.m_areStaffTextPropertiesAvailable = isAvailable && !this.m_textType.isUndefined()
    }

    private updateIsPositionAvailable(): void {
        let available = false
        for (const item of this.m_elementList) {
            if (item.isTextLineBase() || item.isMeasureNumber()) {
                available = false
                break
            } else if (!item.hasVoiceAssignmentProperties()) {
                available = true
            }
        }
        this.m_isPositionAvailable = available
    }

    private updatePositionTexts(): void {
        const tr = AbstractInspectorModel.tr
        for (const item of this.m_elementList) {
            const parent = item.parent()
            if (!parent) {
                continue
            }
            const kind = parent.isBox() ? 'frame'
                : item.isTextBase() && (item as unknown as TextBase).positionRelativeToNoteheadRest() ? 'note' : 'barline'
            this.m_leftPositionText = kind === 'frame' ? tr('Left-align text box within frame')
                : kind === 'note' ? tr('Left-align text box to note/rest') : tr('Left-align text box to barline')
            this.m_centerPositionText = kind === 'frame' ? tr('Horizontally center text box within frame')
                : kind === 'note' ? tr('Horizontally center text box to note/rest') : tr('Horizontally center text box to barline')
            this.m_rightPositionText = kind === 'frame' ? tr('Right-align text box within frame')
                : kind === 'note' ? tr('Right-align text box to note/rest') : tr('Right-align text box to barline')
            return
        }
    }
}
