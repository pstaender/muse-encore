/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/layoutbreak.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, LayoutBreakType } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, ElementFlag } from './engravingitem'
import type { ElementStyle } from './engravingobject'
import { Pid } from './property'
import type { MeasureBase } from './measurebase'
import type { EditData } from '../editing/editdata'
import type { TranslatableString } from '../../framework/global/types/translatablestring'
import { TConv } from '../types/typesconv'

const sectionBreakStyle: ElementStyle = [
    { sid: Sid.sectionPause, pid: Pid.PAUSE },
]

export class LayoutBreak extends EngravingItem {
    private m_pause = 0.0
    private m_startWithLongNames = false
    private m_startWithMeasureOne = false
    private m_firstSystemIndentation = false
    private m_showCourtesy = false
    private m_layoutBreakType = LayoutBreakType.PAGE

    constructor(parent: MeasureBase | null) {
        super(ElementType.LAYOUT_BREAK, parent, ElementFlag.SYSTEM)
        this.initElementStyle(sectionBreakStyle)
        this.resetProperty(Pid.PAUSE)
        this.resetProperty(Pid.START_WITH_LONG_NAMES)
        this.resetProperty(Pid.START_WITH_MEASURE_ONE)
        this.resetProperty(Pid.FIRST_SYSTEM_INDENTATION)
        this.resetProperty(Pid.SHOW_COURTESY)
    }

    override subtype(): number { return this.m_layoutBreakType }
    setLayoutBreakType(val: LayoutBreakType): void { this.m_layoutBreakType = val }
    layoutBreakType(): LayoutBreakType { return this.m_layoutBreakType }
    measure(): MeasureBase { return this.explicitParent() as unknown as MeasureBase }

    override acceptDrop(data: EditData): boolean {
        return data.dropElement!.isLayoutBreak()
            && (data.dropElement as LayoutBreak).layoutBreakType() !== this.layoutBreakType()
    }

    override drop(data: EditData): EngravingItem | null {
        const e = data.dropElement!
        this.score().undoChangeElement(this, e)
        return e
    }

    pause(): number { return this.m_pause }
    setPause(v: number): void { this.m_pause = v }
    startWithLongNames(): boolean { return this.m_startWithLongNames }
    setStartWithLongNames(v: boolean): void { this.m_startWithLongNames = v }
    startWithMeasureOne(): boolean { return this.m_startWithMeasureOne }
    setStartWithMeasureOne(v: boolean): void { this.m_startWithMeasureOne = v }
    firstSystemIndentation(): boolean { return this.m_firstSystemIndentation }
    setFirstSystemIndentation(v: boolean): void { this.m_firstSystemIndentation = v }
    showCourtesy(): boolean { return this.m_showCourtesy }
    setShowCourtesy(v: boolean): void { this.m_showCourtesy = v }

    isPageBreak(): boolean { return this.m_layoutBreakType === LayoutBreakType.PAGE }
    isLineBreak(): boolean { return this.m_layoutBreakType === LayoutBreakType.LINE }
    isSectionBreak(): boolean { return this.m_layoutBreakType === LayoutBreakType.SECTION }
    isNoBreak(): boolean { return this.m_layoutBreakType === LayoutBreakType.NOBREAK }

    iconCode(): number {
        switch (this.m_layoutBreakType) {
        case LayoutBreakType.LINE: return 0xF483
        case LayoutBreakType.PAGE: return 0xF484
        case LayoutBreakType.SECTION: return 0xF485
        case LayoutBreakType.NOBREAK: return 0xF486
        default: return 0x000
        }
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.LAYOUT_BREAK: return this.m_layoutBreakType
        case Pid.PAUSE: return this.m_pause
        case Pid.START_WITH_LONG_NAMES: return this.m_startWithLongNames
        case Pid.START_WITH_MEASURE_ONE: return this.m_startWithMeasureOne
        case Pid.FIRST_SYSTEM_INDENTATION: return this.m_firstSystemIndentation
        case Pid.SHOW_COURTESY: return this.m_showCourtesy
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.LAYOUT_BREAK:
            this.setLayoutBreakType(v as LayoutBreakType)
            break
        case Pid.PAUSE:
            this.setPause(v as number)
            this.score().setUpTempoMapLater()
            break
        case Pid.START_WITH_LONG_NAMES:
            this.setStartWithLongNames(!!v)
            break
        case Pid.START_WITH_MEASURE_ONE:
            this.setStartWithMeasureOne(!!v)
            break
        case Pid.FIRST_SYSTEM_INDENTATION:
            this.setFirstSystemIndentation(!!v)
            break
        case Pid.SHOW_COURTESY:
            this.setShowCourtesy(!!v)
            break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
            break
        }
        this.setGenerated(false)
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.LAYOUT_BREAK: return undefined // LAYOUT_BREAK_LINE;
        case Pid.PAUSE: return this.style().styleD(Sid.sectionPause)
        case Pid.START_WITH_LONG_NAMES: return true
        case Pid.START_WITH_MEASURE_ONE: return true
        case Pid.FIRST_SYSTEM_INDENTATION: return true
        case Pid.SHOW_COURTESY: return false
        default: return super.propertyDefault(id)
        }
    }

    override subtypeUserName(): TranslatableString {
        return TConv.userNameLayoutBreakType(this.layoutBreakType())
    }

    override accessibleInfo(): string {
        return this.translatedSubtypeUserName()
    }

    override added(): void {
        this.score().setUpTempoMapLater()
    }

    override removed(): void {
        this.score().setUpTempoMapLater()
    }
}
