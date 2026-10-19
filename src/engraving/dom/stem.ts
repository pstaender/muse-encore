/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/stem.h/.cpp
 */

import { LineF, PointF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { DirectionV, ElementType, type staff_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, LayoutData } from './engravingitem'
import type { ElementStyle } from './engravingobject'
import { Pid } from './property'
import { chordFactories, type Chord } from './chord'

const stemStyle: ElementStyle = [
    { sid: Sid.stemWidth, pid: Pid.LINE_WIDTH },
]

export class StemLayoutData extends LayoutData {
    line = new LineF()
    beamCorrection = 0.0
}

export class Stem extends EngravingItem {
    private m_baseLength = new Spatium(0)
    private m_userLength = new Spatium(0)
    private m_lineWidth = new Spatium(0)

    constructor(parent: Chord | null) {
        super(ElementType.STEM, parent)
        this.initElementStyle(stemStyle)
        this.resetProperty(Pid.USER_LEN)
    }

    protected override createLayoutData(): StemLayoutData { return new StemLayoutData(this) }
    override ldata(): StemLayoutData { return super.ldata() as StemLayoutData }
    override mutldata(): StemLayoutData { return super.ldata() as StemLayoutData }

    override elementBase(): EngravingItem { return this.parentItem()! }
    override vStaffIdx(): staff_idx_t { return this.staffIdx() + this.chord().staffMove() }

    chord(): Chord { return this.explicitParent() as unknown as Chord }
    up(): boolean { return this.explicitParent() ? this.chord().up() : true }

    baseLength(): Spatium { return this.m_baseLength }
    setBaseLength(baseLength: Spatium): void { this.m_baseLength = new Spatium(Math.abs(baseLength.val())) }
    userLength(): Spatium { return this.m_userLength }
    setUserLength(userLength: Spatium): void { this.m_userLength = userLength }
    lineWidth(): Spatium { return this.m_lineWidth }
    lineWidthMag(): number { return this.absoluteFromSpatium(this.m_lineWidth) * this.chord().intrinsicMag() }
    setLineWidth(lineWidth: Spatium): void { this.m_lineWidth = lineWidth }

    flagPosition(): PointF {
        return this.pos().plus(new PointF(this.ldata().bbox().left(), this.up() ? -this.length() : this.length()))
    }

    length(): number { return this.absoluteFromSpatium(this.m_baseLength.plus(this.m_userLength)) }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.LINE_WIDTH: return this.lineWidth()
        case Pid.USER_LEN: return this.userLength()
        case Pid.STEM_DIRECTION: return this.chord().stemDirection()
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.LINE_WIDTH:
            this.setLineWidth(v as Spatium)
            break
        case Pid.USER_LEN:
            this.setUserLength(v as Spatium)
            break
        case Pid.STEM_DIRECTION:
            this.chord().setStemDirection(v as DirectionV)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.USER_LEN: return new Spatium(0)
        case Pid.STEM_DIRECTION: return DirectionV.AUTO
        default:
            return super.propertyDefault(id)
        }
    }
}

chordFactories.createStem = (chord: Chord) => new Stem(chord)
