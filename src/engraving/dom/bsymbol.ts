/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/bsymbol.h/.cpp
 */

import { LineF, PointF } from '../../framework/draw/types/geometry'
import { Align, AlignH, AlignV, type ElementType } from '../types/types'
import { EngravingItem, ElementFlag } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import type { Segment } from './segment'

/** base class for Symbol and Image */
export abstract class BSymbol extends EngravingItem {
    private m_leafs: EngravingItem[] = []
    private m_align = new Align(AlignH.LEFT, AlignV.BASELINE)

    protected constructor(type: ElementType, parent: EngravingObject | null, f: number = ElementFlag.NOTHING) {
        super(type, parent, f)
    }

    segment(): Segment { return this.explicitParent() as unknown as Segment }

    override scanElements(func: (item: EngravingItem) => void): void {
        func(this)
        for (const e of this.m_leafs) {
            e.scanElements(func)
        }
    }

    override add(e: EngravingItem): void {
        if (e.isSymbol() || e.isImage()) {
            e.setParent(this)
            e.setTrack(this.track())
            this.m_leafs.push(e)
            e.setZ(this.z() - 1) // draw on top of parent
        }
    }

    override remove(e: EngravingItem): void {
        if (e.isSymbol() || e.isImage()) {
            const i = this.m_leafs.indexOf(e)
            if (i >= 0) {
                this.m_leafs.splice(i, 1)
            }
        }
    }

    align(): Align { return this.m_align }
    setAlign(a: Align): void { this.m_align = a }
    leafs(): EngravingItem[] { return this.m_leafs }

    override pagePos(): PointF {
        const p = this.explicitParent()
        if (p && p.isSegment()) {
            const pos = this.pos()
            const system = this.segment().measure().system()
            if (system) {
                pos.setY(pos.y() + system.staff(this.staffIdx())!.y() + system.y())
            }
            pos.setX(this.pageX())
            return pos
        }
        return super.pagePos()
    }

    override canvasPos(): PointF {
        const p = this.explicitParent()
        if (p && p.isSegment()) {
            const pos = this.pos()
            const system = this.segment().measure().system()
            if (system) {
                pos.setY(pos.y() + system.staff(this.staffIdx())!.y() + system.y())
                const page = system.page()
                if (page) {
                    pos.setY(pos.y() + page.y())
                }
            }
            pos.setX(this.canvasX())
            return pos
        }
        return super.canvasPos()
    }

    override dragAnchorLines(): LineF[] {
        return this.genericDragAnchorLines()
    }
}
