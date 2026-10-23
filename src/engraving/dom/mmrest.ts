/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/mmrest.h/.cpp
 */

import { PointF, RectF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import type { SymIdList } from '../types/symid'
import { ElementType, PlacementV, nidx } from '../types/types'
import { Sid } from '../style/styledef'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import { Rest, RestLayoutData } from './rest'
import { timeSigSymIdsFromString } from './utils'

export class MMRestLayoutData extends RestLayoutData {
    number = 0 // number of measures represented
    yNumberPos = 0.0
    numberSym: SymIdList = []
    restSyms: SymIdList = [] // stores symbols when using old-style rests
    symsWidth = 0.0 // width of symbols with spacing when using old-style
    restWidth = 0.0 // width of multimeasure rest

    setNumberSym(n: number): void { this.numberSym = timeSigSymIdsFromString(String(n)) }
}

export class MMRest extends Rest {
    private m_numberOffset = new Spatium(0.0) // vertical position of number relative to staff
    private m_numberVisible = true // show or hide number

    constructor(parent: EngravingObject | null) {
        super(parent, undefined, ElementType.MMREST)
        this.setPlacement(PlacementV.ABOVE)
    }

    protected override createLayoutData(): MMRestLayoutData { return new MMRestLayoutData(this) }
    override ldata(): MMRestLayoutData { return super.ldata() as MMRestLayoutData }
    override mutldata(): MMRestLayoutData { return super.ldata() as MMRestLayoutData }

    shouldShowNumberByDefault(): boolean {
        const shouldShow = this.isOldStyle() && this.ldata().number === 1 ? this.style().styleB(Sid.singleMeasureMMRestShowNumber) : true
        const itemPart = this.part()!
        const system = this.measure().system()
        const isTopStaffOfPartAndCenteringIsActive = itemPart.nstaves() > 1 && this.staff() === itemPart.staves()[0]
                                                     && (!!system && system.nextVisibleStaff(this.staffIdx()) !== nidx)
                                                     && this.style().styleB(Sid.mmRestBetweenStaves)
        return shouldShow && !isTopStaffOfPartAndCenteringIsActive
    }

    showNumber(): boolean {
        return this.shouldShowNumberByDefault() && this.m_numberVisible
    }

    isOldStyle(): boolean {
        const number = this.ldata().number
        return (this.style().styleB(Sid.oldStyleMultiMeasureRests) && number <= this.style().styleI(Sid.mmRestOldStyleMaxMeasures))
               || (number === 1 && this.style().styleB(Sid.singleMeasureMMRestUseNormalRest))
    }

    override numberRect(): RectF {
        return this.symBboxList(this.ldata().numberSym)
    }

    numberPos(): PointF {
        const numBBox = this.numberRect()
        const x = 0.5 * (this.ldata().restWidth - numBBox.width())
        const y = -this.pos().y() + this.yNumberPos() - 0.5 * numBBox.height()
        return new PointF(x, y)
    }

    setNumberOffset(y: Spatium): void { this.m_numberOffset = y }
    numberOffset(): Spatium { return this.m_numberOffset }

    yNumberPos(): number {
        return this.ldata().yNumberPos + this.m_numberOffset.val() * this.spatium()
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.MMREST_NUMBER_OFFSET: return new Spatium(0.0)
        case Pid.MMREST_NUMBER_VISIBLE: return true
        default: return super.propertyDefault(propertyId)
        }
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.MMREST_NUMBER_OFFSET: return this.m_numberOffset
        case Pid.MMREST_NUMBER_VISIBLE: return this.m_numberVisible
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.MMREST_NUMBER_OFFSET:
            this.m_numberOffset = v as Spatium
            break
        case Pid.MMREST_NUMBER_VISIBLE:
            this.m_numberVisible = v as boolean
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }
}
