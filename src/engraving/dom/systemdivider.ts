/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/systemdivider.h/.cpp
 * TODO(port): reset() (EngravingItem::reset is not ported)
 */

import { LineF, PointF, type RectF } from '../../framework/draw/types/geometry'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { SymNames } from '../types/symnames'
import { ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import type { EditData } from '../editing/editdata'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Segment } from './segment'
import { Symbol } from './symbol'
import type { System } from './system'

export enum SystemDividerType {
    LEFT, RIGHT,
}

const dividerStyle: ElementStyle = [
    { sid: Sid.dividerLeftSize, pid: Pid.SYMBOLS_SIZE }, // left or right is decided later
    { sid: Sid.musicalSymbolFont, pid: Pid.SCORE_FONT },
]

export class SystemDivider extends Symbol {
    private m_dividerType = SystemDividerType.LEFT

    constructor(parent: EngravingObject | null) {
        super(parent, ElementFlag.SYSTEM | ElementFlag.MOVABLE, ElementType.SYSTEM_DIVIDER)
        // default value, but not valid until setDividerType()
        this.m_dividerType = SystemDividerType.LEFT
        this.m_sym = SymId.systemDivider
    }

    dividerType(): SystemDividerType { return this.m_dividerType }

    setDividerType(v: SystemDividerType): void {
        this.m_dividerType = v

        if (v === SystemDividerType.LEFT) {
            this.setSym(SymNames.symIdByName(this.style().styleSt(Sid.dividerLeftSym)))
        } else {
            this.setSym(SymNames.symIdByName(this.style().styleSt(Sid.dividerRightSym)))
        }

        this.initElementStyle(dividerStyle)
    }

    override segment(): Segment { return null as unknown as Segment }
    system(): System | null { return this.explicitParent() as unknown as System | null }

    override styleChanged(): void {
        if (this.m_dividerType === SystemDividerType.LEFT) {
            this.setSym(SymNames.symIdByName(this.style().styleSt(Sid.dividerLeftSym)))
        } else {
            this.setSym(SymNames.symIdByName(this.style().styleSt(Sid.dividerRightSym)))
        }

        if (this.isStyled(Pid.SYMBOLS_SIZE)) {
            this.m_symbolsSize = this.style().styleD(this.getPropertyStyle(Pid.SYMBOLS_SIZE))
        }

        super.styleChanged()
    }

    override getPropertyStyle(id: Pid): Sid {
        if (id === Pid.SYMBOLS_SIZE) {
            return this.m_dividerType === SystemDividerType.LEFT ? Sid.dividerLeftSize : Sid.dividerRightSize
        }

        return super.getPropertyStyle(id)
    }

    override dragAnchorLines(): LineF[] {
        const result: LineF[] = []

        const p = this.parentItem()
        if (!p || !p.isSystem()) {
            return result // C++ IF_ASSERT_FAILED
        }
        const system = p as unknown as System

        const systemBBox = system.canvasBoundingRect()
        const p1 = new PointF(this.m_dividerType === SystemDividerType.LEFT
            ? systemBBox.left() + system.leftMargin() : systemBBox.right(), systemBBox.bottom())

        const thisBBox = this.canvasBoundingRect()
        const p2 = thisBBox.topLeft().plus(thisBBox.bottomRight()).times(0.5)

        result.push(new LineF(p1, p2))

        return result
    }

    override drag(ed: EditData): RectF {
        this.setGenerated(false)
        return super.drag(ed)
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.SYMBOLS_SIZE:
            return this.style().styleD(this.m_dividerType === SystemDividerType.LEFT ? Sid.dividerLeftSize : Sid.dividerRightSize)
        default:
            return super.propertyDefault(id)
        }
    }
}
