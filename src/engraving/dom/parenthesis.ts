/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/parenthesis.h/.cpp
 */

import type { Color } from '../../framework/draw/types/color'
import { PainterPath } from '../../framework/draw/types/painterpath'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { DirectionH, ElementType } from '../types/types'
import type { PaintOptions } from '../rendering/paintoptions'
import { ElementFlag, EngravingItem, LayoutData, itemFactories } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Segment } from './segment'

export class ParenthesisLayoutData extends LayoutData {
    path = new PainterPath()
    startY = 0.0
    height = 0.0
    midPointThickness = 0.0
    endPointThickness = Parenthesis.PARENTHESIS_END_WIDTH
    shoulderWidth = 0.0
    intrinsicMag = 1.0 // Mag separate from staff scale
    symId = SymId.noSym
    symScale = 1.0
}

export class Parenthesis extends EngravingItem {
    static readonly PARENTHESIS_END_WIDTH = 0.1

    private m_direction = DirectionH.LEFT
    private m_followParentColor = false

    constructor(parent: EngravingObject | null) {
        super(ElementType.PARENTHESIS, parent, ElementFlag.MOVABLE)
    }

    protected override createLayoutData(): ParenthesisLayoutData { return new ParenthesisLayoutData(this) }
    override ldata(): ParenthesisLayoutData { return super.ldata() as ParenthesisLayoutData }
    override mutldata(): ParenthesisLayoutData { return super.ldata() as ParenthesisLayoutData }

    direction(): DirectionH { return this.m_direction }
    setDirection(v: DirectionH): void { this.m_direction = v }

    segment(): Segment | null {
        const p = this.explicitParent()
        return p && p.isSegment() ? p as unknown as Segment : null
    }

    override getProperty(pid: Pid): PropertyValue {
        switch (pid) {
        case Pid.HORIZONTAL_DIRECTION:
            return this.direction()
        default:
            return super.getProperty(pid)
        }
    }

    override setProperty(pid: Pid, v: PropertyValue): boolean {
        switch (pid) {
        case Pid.HORIZONTAL_DIRECTION:
            this.setDirection(v as DirectionH)
            break
        default:
            return super.setProperty(pid, v)
        }
        return true
    }

    override propertyDefault(pid: Pid): PropertyValue {
        switch (pid) {
        case Pid.HORIZONTAL_DIRECTION:
            return DirectionH.LEFT
        default:
            return super.propertyDefault(pid)
        }
    }

    followParentCurColor(): boolean { return this.m_followParentColor }
    setFollowParentColor(val: boolean): void { this.m_followParentColor = val }

    override curColor(opt: PaintOptions = {}): Color {
        if (this.m_followParentColor) {
            return this.parentItem()!.curColor(opt)
        }
        return this.curColorWith(this.getProperty(Pid.VISIBLE) as boolean, this.getProperty(Pid.COLOR) as Color, opt)
    }
}

itemFactories.createParenthesis = (parent: EngravingItem) => new Parenthesis(parent)
