/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/expression.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Dynamic } from './dynamic'
import type { Segment } from './segment'
import { TextBase } from './textbase'

const expressionStyle: ElementStyle = [
    { sid: Sid.expressionPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.expressionMinDistance, pid: Pid.MIN_DISTANCE },
    { sid: Sid.snapToDynamics, pid: Pid.SNAP_TO_DYNAMICS },
]

export class Expression extends TextBase {
    private m_snapToDynamics = true

    constructor(parent: EngravingObject | null) {
        super(ElementType.EXPRESSION, parent, TextStyleType.EXPRESSION, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initElementStyle(expressionStyle)
    }

    segment(): Segment { return this.explicitParent() as unknown as Segment }

    snapToDynamics(): boolean { return this.m_snapToDynamics }
    setSnapToDynamics(v: boolean): void { this.m_snapToDynamics = v }

    override positionRelativeToNoteheadRest(): boolean { return true }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.TEXT_STYLE:
            return TextStyleType.EXPRESSION
        default:
            return super.propertyDefault(id)
        }
    }

    computeDynamicExpressionDistance(snappedDyn: Dynamic): number {
        // We are essentially faking the kerning behaviour of dynamic VS expression text
        // There's no other way to do this because the dynamic is a different font.
        const dynamicTextString = snappedDyn.xmlText()
        const f = '<sym>dynamicForte</sym>'
        let distance = (dynamicTextString.endsWith(f) ? 0.2 : 0.5) * this.spatium()
        distance *= 0.5 * (snappedDyn.symbolScale() + (this.size() / 10))
        return distance
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SNAP_TO_DYNAMICS:
            return this.m_snapToDynamics
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.SNAP_TO_DYNAMICS:
            if (this.m_snapToDynamics === false && v === true) {
                this.resetProperty(Pid.OFFSET)
            }
            this.setSnapToDynamics(v as boolean)
            break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
            break
        }
        return true
    }

    snappedDynamic(): Dynamic | null {
        const item = this.ldata().itemSnappedBefore()
        return item && item.isDynamic() ? item as unknown as Dynamic : null
    }
}
